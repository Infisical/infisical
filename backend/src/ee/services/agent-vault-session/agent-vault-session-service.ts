import { ForbiddenError } from "@casl/ability";

import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionAgentVaultSessionActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { ms } from "@app/lib/ms";
import { ActorType } from "@app/services/auth/auth-type";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { TAgentVaultAccessBundleDALFactory } from "../agent-vault-access-bundle/agent-vault-access-bundle-dal";
import { TAgentVaultDelegationDALFactory } from "../agent-vault-delegation/agent-vault-delegation-dal";
import { findCallerDelegation, resolveOnBehalfOfUser } from "../agent-vault-delegation/agent-vault-on-behalf-of-fns";
import { generateSessionLogKey, wrapSessionLogKey } from "../agent-vault-session-log/agent-vault-session-log-secrets";
import { AgentVaultMemberType, AgentVaultSessionScope } from "../agent-vault/agent-vault-enums";
import { getAgentVaultPermission, getAgentVaultReachability } from "../agent-vault/agent-vault-permission";
import { TAgentVaultSessionAccessBundleDALFactory } from "./agent-vault-session-access-bundle-dal";
import { TAgentVaultSessionDALFactory, TAgentVaultSessionListRow } from "./agent-vault-session-dal";
import { deriveSessionStatus, generateSessionToken } from "./agent-vault-session-fns";
import {
  TGetSessionByIdDTO,
  TListSessionsDTO,
  TMintSessionDTO,
  TRevokeSessionDTO,
  TUpdateSessionLabelDTO
} from "./agent-vault-session-types";

// V1 ships one bundle per session; the junction table, `position` and the proxy matcher all handle more.
export const AGENT_VAULT_MAX_SESSION_BUNDLES = 1;
export const AGENT_VAULT_SESSION_DEFAULT_TTL = "7d";
export const AGENT_VAULT_SESSION_TTL_NEVER = "never";
// Past roughly 1e8 days the expiry overflows Date and Postgres rejects the row as a 500. A century is
// far beyond any real lifetime and keeps the message honest; "never" exists for no expiry at all.
export const AGENT_VAULT_SESSION_MAX_TTL_MS = 100 * 365 * 24 * 60 * 60 * 1000;
// The user an on-behalf-of session acts for didn't start it and may not know it exists, so it is short by default.
// It should probably have a maximum too, but for now any TTL is allowed, never included.
export const AGENT_VAULT_ON_BEHALF_OF_SESSION_DEFAULT_TTL = "1h";

type TAgentVaultSessionServiceFactoryDep = {
  agentVaultSessionDAL: TAgentVaultSessionDALFactory;
  agentVaultSessionAccessBundleDAL: TAgentVaultSessionAccessBundleDALFactory;
  agentVaultAccessBundleDAL: Pick<TAgentVaultAccessBundleDALFactory, "find">;
  agentVaultDelegationDAL: Pick<TAgentVaultDelegationDALFactory, "findForIdentity" | "coversUser">;
  membershipDAL: Pick<TMembershipDALFactory, "findResourceMembershipsForActor">;
  userDAL: Pick<TUserDALFactory, "findOne">;
  orgDAL: Pick<TOrgDALFactory, "findEffectiveOrgMembership">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  kmsService: Pick<TKmsServiceFactory, "wrapKey">;
};

export type TAgentVaultSessionServiceFactory = ReturnType<typeof agentVaultSessionServiceFactory>;

export const agentVaultSessionServiceFactory = ({
  agentVaultSessionDAL,
  agentVaultSessionAccessBundleDAL,
  agentVaultAccessBundleDAL,
  agentVaultDelegationDAL,
  membershipDAL,
  userDAL,
  orgDAL,
  permissionService,
  kmsService
}: TAgentVaultSessionServiceFactoryDep) => {
  const requireSessionActor = (ctx: TMintSessionDTO["ctx"]) => {
    if (ctx.actor !== ActorType.USER && ctx.actor !== ActorType.IDENTITY) {
      throw new BadRequestError({ message: "Only a user or machine identity can hold an Agent Vault session" });
    }
    return { type: ctx.actor, id: ctx.actorId };
  };

  const toSessionView = ({
    userId,
    identityId,
    onBehalfOfUserId,
    onBehalfOfUserName,
    ...session
  }: TAgentVaultSessionListRow) => ({
    ...session,
    status: deriveSessionStatus({ ...session, userId, identityId, onBehalfOfUserId, onBehalfOfUserName })
  });

  const resolveSessionTtl = (ttl: string | undefined, isOnBehalfOf: boolean) =>
    ttl ?? (isOnBehalfOf ? AGENT_VAULT_ON_BEHALF_OF_SESSION_DEFAULT_TTL : AGENT_VAULT_SESSION_DEFAULT_TTL);

  const mintSession = async ({
    projectId,
    ctx,
    accessBundles,
    actorName,
    actorEmail,
    ttl: requestedTtl,
    onBehalfOf,
    label
  }: TMintSessionDTO) => {
    const caller = requireSessionActor(ctx);
    const ttl = resolveSessionTtl(requestedTtl, Boolean(onBehalfOf));

    const { permission } = await getAgentVaultPermission({ permissionService }, { projectId, ctx });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentVaultSessionActions.Create,
      ProjectPermissionSub.AgentVaultSessions
    );

    if (!accessBundles.length) {
      throw new BadRequestError({ message: "Name the access bundle this session should carry" });
    }
    if (accessBundles.length > AGENT_VAULT_MAX_SESSION_BUNDLES) {
      throw new BadRequestError({ message: "A session carries one access bundle. Name only one." });
    }
    if (new Set(accessBundles).size !== accessBundles.length) {
      throw new BadRequestError({ message: "You've named the same access bundle more than once. Name it only once." });
    }

    const bundles = await agentVaultAccessBundleDAL.find({ projectId, $in: { name: accessBundles } });
    const bundlesByName = new Map(bundles.map((bundle) => [bundle.name, bundle]));
    // An unknown name reads like an ungranted one, so the error never confirms that a bundle exists.
    const firstUnreachable = (reachable: string[] | null) =>
      accessBundles.find((name) => {
        const bundle = bundlesByName.get(name);
        return !bundle || (reachable !== null && !reachable.includes(bundle.id));
      });

    let onBehalfOfUser: Awaited<ReturnType<typeof resolveOnBehalfOfUser>> | null = null;
    if (onBehalfOf) {
      // A session on a user's behalf can use only the bundles both the user and the identity reach. The delegation is
      // checked first and the identity's own bundles next, so an identity learns nothing about who is in the org until
      // an admin has delegated it and granted it the bundle it asks for.
      const delegation = await findCallerDelegation({ agentVaultDelegationDAL }, { projectId, ctx });
      const { accessBundleIds: identityReach } = await getAgentVaultReachability(
        { permissionService, membershipDAL },
        { projectId, ctx }
      );
      const notGrantedToIdentity = firstUnreachable(identityReach);
      if (notGrantedToIdentity) {
        throw new BadRequestError({
          message: `No access bundle named '${notGrantedToIdentity}' is granted to this machine identity. A session on behalf of a user can use only bundles granted to both the user and the machine identity, so check the name, or ask an Agent Vault admin to grant the bundle to the machine identity.`
        });
      }

      onBehalfOfUser = await resolveOnBehalfOfUser(
        { agentVaultDelegationDAL, userDAL, orgDAL, permissionService, membershipDAL },
        { projectId, ctx, onBehalfOf, delegation }
      );
      // getProjectPermission leaves the last actor it ran for in the request context, where the audit log reads the
      // caller's permission metadata. Running the caller's check again, memoized so it costs no query, puts it back.
      await getAgentVaultPermission({ permissionService }, { projectId, ctx });

      const notGrantedToUser = firstUnreachable(onBehalfOfUser.accessBundleIds);
      if (notGrantedToUser) {
        throw new BadRequestError({
          message: `No access bundle named '${notGrantedToUser}' is granted to '${onBehalfOfUser.identifier}'. Check the name, or ask an Agent Vault admin to grant it to them.`
        });
      }
    } else {
      const { accessBundleIds } = await getAgentVaultReachability(
        { permissionService, membershipDAL },
        { projectId, ctx }
      );
      const notGranted = firstUnreachable(accessBundleIds);
      if (notGranted) {
        throw new BadRequestError({
          message: `No access bundle named '${notGranted}' is granted to you. Check the name, or ask an Agent Vault admin to grant it.`
        });
      }
    }

    const ttlMs = ttl === AGENT_VAULT_SESSION_TTL_NEVER ? null : ms(ttl);
    const expiresAt = ttlMs === null ? null : new Date(Date.now() + ttlMs);
    const { token, tokenHash } = generateSessionToken();

    const sessionId = crypto.nativeCrypto.randomUUID();
    const encryptedSessionLogKey = await wrapSessionLogKey(
      { projectId, sessionId, sessionLogKey: generateSessionLogKey() },
      kmsService
    );

    // A session on a user's behalf belongs to the identity, so only it and admins see the session and its logs. The
    // user is kept alongside: resolve uses their personal values and intersects their reach with the identity's.
    const owner = {
      userId: caller.type === ActorType.USER ? caller.id : null,
      identityId: caller.type === ActorType.IDENTITY ? caller.id : null,
      actorType: caller.type === ActorType.IDENTITY ? AgentVaultMemberType.MachineIdentity : AgentVaultMemberType.User,
      actorName,
      actorEmail,
      ...(onBehalfOfUser && {
        onBehalfOfUserId: onBehalfOfUser.user.id,
        onBehalfOfUserName:
          `${onBehalfOfUser.user.firstName ?? ""} ${onBehalfOfUser.user.lastName ?? ""}`.trim() ||
          (onBehalfOfUser.user.email ?? onBehalfOfUser.user.username),
        onBehalfOfUserEmail: onBehalfOfUser.user.email ?? null
      })
    };

    const session = await agentVaultSessionDAL.transaction(async (tx) => {
      const created = await agentVaultSessionDAL.createWithId(
        {
          id: sessionId,
          projectId,
          ...owner,
          label: label || null,
          tokenHash,
          expiresAt,
          encryptedSessionLogKey
        },
        tx
      );

      await agentVaultSessionAccessBundleDAL.insertMany(
        accessBundles.map((name, position) => ({
          sessionId: created.id,
          accessBundleId: bundlesByName.get(name)!.id,
          accessBundleName: name,
          position
        })),
        tx
      );

      return created;
    });

    return {
      session: {
        id: session.id,
        label: session.label ?? null,
        expiresAt: session.expiresAt ?? null,
        createdAt: session.createdAt,
        accessBundles: accessBundles.map((name, position) => ({
          id: bundlesByName.get(name)!.id,
          name,
          position
        }))
      },
      token,
      ttlSeconds: ttlMs === null ? null : Math.floor(ttlMs / 1000),
      onBehalfOf: onBehalfOfUser
        ? { userId: onBehalfOfUser.user.id, username: onBehalfOfUser.user.username, email: onBehalfOfUser.user.email }
        : null
    };
  };

  const listSessions = async ({ projectId, ctx, scope, statuses, search, limit, offset }: TListSessionsDTO) => {
    const { permission, isAdmin } = await getAgentVaultPermission({ permissionService }, { projectId, ctx });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentVaultSessionActions.Read,
      ProjectPermissionSub.AgentVaultSessions
    );

    // The CASL read action alone would let any member list everyone's sessions.
    if (scope === AgentVaultSessionScope.All && !isAdmin) {
      throw new ForbiddenRequestError({ message: "Only an Agent Vault administrator can list everyone's sessions" });
    }

    const actor = scope === AgentVaultSessionScope.All ? undefined : requireSessionActor(ctx);
    const { sessions, totalCount } = await agentVaultSessionDAL.findForList({
      projectId,
      actor,
      statuses,
      search,
      limit,
      offset
    });

    return { sessions: sessions.map(toSessionView), totalCount };
  };

  // A session you may not see reads exactly like one that does not exist.
  const findVisibleSession = async ({
    projectId,
    ctx,
    sessionId,
    isAdmin
  }: TGetSessionByIdDTO & { isAdmin: boolean }) => {
    const {
      sessions: [session]
    } = await agentVaultSessionDAL.findForList({
      projectId,
      sessionId,
      actor: isAdmin ? undefined : requireSessionActor(ctx),
      limit: 1,
      offset: 0
    });
    if (!session) throw new NotFoundError({ message: `Session with ID '${sessionId}' not found` });
    return session;
  };

  const getSessionById = async ({ projectId, ctx, sessionId }: TGetSessionByIdDTO) => {
    const { permission, isAdmin } = await getAgentVaultPermission({ permissionService }, { projectId, ctx });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentVaultSessionActions.Read,
      ProjectPermissionSub.AgentVaultSessions
    );

    return { session: toSessionView(await findVisibleSession({ projectId, ctx, sessionId, isAdmin })) };
  };

  const revokeSession = async ({ projectId, ctx, sessionId }: TRevokeSessionDTO) => {
    const { permission, isAdmin } = await getAgentVaultPermission({ permissionService }, { projectId, ctx });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentVaultSessionActions.Revoke,
      ProjectPermissionSub.AgentVaultSessions
    );

    const session = await findVisibleSession({ projectId, ctx, sessionId, isAdmin });

    // revokedNow lets the caller audit a real revocation without auditing a repeat. Revoking twice stays a
    // 200 with the original revokedAt, so the second caller is not the one who revoked it.
    if (session.revokedAt) return { session: toSessionView(session), revokedNow: false };

    // The timestamp comes from the written row: a read-back could land on a replica that has not seen it.
    const revoked = await agentVaultSessionDAL.revokeIfActive(session.id, new Date());
    if (revoked) {
      return { session: toSessionView({ ...session, revokedAt: revoked.revokedAt ?? null }), revokedNow: true };
    }

    // Nothing was written: a concurrent revoke won, or the owner or the user it acts for was deleted, which already
    // reads as revoked and is left untouched. Report the row as it is now, which the read above may not have seen.
    const current = await agentVaultSessionDAL.findByIdOnPrimary(session.id, projectId);
    return {
      session: toSessionView(
        current
          ? {
              ...session,
              revokedAt: current.revokedAt ?? null,
              userId: current.userId ?? null,
              identityId: current.identityId ?? null,
              onBehalfOfUserId: current.onBehalfOfUserId ?? null,
              onBehalfOf: session.onBehalfOf && { ...session.onBehalfOf, id: current.onBehalfOfUserId ?? null }
            }
          : session
      ),
      revokedNow: false
    };
  };

  const updateSessionLabel = async ({ projectId, ctx, sessionId, label }: TUpdateSessionLabelDTO) => {
    const { permission, isAdmin } = await getAgentVaultPermission({ permissionService }, { projectId, ctx });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentVaultSessionActions.Edit,
      ProjectPermissionSub.AgentVaultSessions
    );

    const session = await findVisibleSession({ projectId, ctx, sessionId, isAdmin });
    // The visible session can come from a replica that lags, so the owner check and the previous label come from
    // the write itself.
    const updated = await agentVaultSessionDAL.updateLabel(session.id, projectId, label);
    if (!updated) throw new NotFoundError({ message: `Session with ID '${sessionId}' not found` });
    if (!updated.isUpdated) {
      throw new BadRequestError({
        message:
          "The user or machine identity that owned this session, or the user it was started on behalf of, was deleted, so its label can't be changed."
      });
    }

    return { session: toSessionView({ ...session, label }), previousLabel: updated.previousLabel };
  };

  return {
    mintSession,
    listSessions,
    getSessionById,
    revokeSession,
    updateSessionLabel
  };
};
