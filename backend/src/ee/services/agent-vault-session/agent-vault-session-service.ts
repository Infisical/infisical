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

import { AgentVaultMemberType, AgentVaultSessionScope } from "../agent-vault/agent-vault-enums";
import { getAgentVaultPermission, getAgentVaultReachability } from "../agent-vault/agent-vault-permission";
import { TAgentVaultAccessBundleDALFactory } from "../agent-vault-access-bundle/agent-vault-access-bundle-dal";
import { generateSessionLogKey, wrapSessionLogKey } from "../agent-vault-session-log/agent-vault-session-log-secrets";
import { TAgentVaultSessionAccessBundleDALFactory } from "./agent-vault-session-access-bundle-dal";
import { TAgentVaultSessionDALFactory, TAgentVaultSessionListRow } from "./agent-vault-session-dal";
import { deriveSessionStatus, generateSessionToken } from "./agent-vault-session-fns";
import { TGetSessionByIdDTO, TListSessionsDTO, TMintSessionDTO, TRevokeSessionDTO } from "./agent-vault-session-types";

// V1 ships one bundle per session; the junction table, `position` and the proxy matcher all handle more.
export const AGENT_VAULT_MAX_SESSION_BUNDLES = 1;
export const AGENT_VAULT_SESSION_DEFAULT_TTL = "7d";
export const AGENT_VAULT_SESSION_TTL_NEVER = "never";
// Past roughly 1e8 days the expiry overflows Date and Postgres rejects the row as a 500. A century is
// far beyond any real lifetime and keeps the message honest; "never" exists for no expiry at all.
export const AGENT_VAULT_SESSION_MAX_TTL_MS = 100 * 365 * 24 * 60 * 60 * 1000;

type TAgentVaultSessionServiceFactoryDep = {
  agentVaultSessionDAL: TAgentVaultSessionDALFactory;
  agentVaultSessionAccessBundleDAL: TAgentVaultSessionAccessBundleDALFactory;
  agentVaultAccessBundleDAL: Pick<TAgentVaultAccessBundleDALFactory, "find">;
  membershipDAL: Pick<TMembershipDALFactory, "findResourceMembershipsForActor">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
};

export type TAgentVaultSessionServiceFactory = ReturnType<typeof agentVaultSessionServiceFactory>;

export const agentVaultSessionServiceFactory = ({
  agentVaultSessionDAL,
  agentVaultSessionAccessBundleDAL,
  agentVaultAccessBundleDAL,
  membershipDAL,
  permissionService,
  kmsService
}: TAgentVaultSessionServiceFactoryDep) => {
  const requireSessionActor = (ctx: TMintSessionDTO["ctx"]) => {
    if (ctx.actor !== ActorType.USER && ctx.actor !== ActorType.IDENTITY) {
      throw new BadRequestError({ message: "Only a user or machine identity can hold an Agent Vault session" });
    }
    return { type: ctx.actor, id: ctx.actorId };
  };

  const toSessionView = ({ userId, identityId, ...session }: TAgentVaultSessionListRow) => ({
    ...session,
    status: deriveSessionStatus({ ...session, userId, identityId })
  });

  const mintSession = async ({ projectId, ctx, accessBundles, actorName, actorEmail, ttl }: TMintSessionDTO) => {
    const actor = requireSessionActor(ctx);
    const { permission, accessBundleIds: reachable } = await getAgentVaultReachability(
      { permissionService, membershipDAL },
      { projectId, ctx }
    );
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

    const unreachable = accessBundles.find((name) => {
      const bundle = bundlesByName.get(name);
      return !bundle || (reachable !== null && !reachable.includes(bundle.id));
    });
    if (unreachable) {
      throw new BadRequestError({
        message: `No access bundle named '${unreachable}' is granted to you. Check the name, or ask an Agent Vault admin to grant it.`
      });
    }

    const expiresAt = ttl === AGENT_VAULT_SESSION_TTL_NEVER ? null : new Date(Date.now() + ms(ttl));
    const { token, tokenHash } = generateSessionToken();

    const sessionId = crypto.nativeCrypto.randomUUID();
    const encryptedSessionLogKey = await wrapSessionLogKey(
      { projectId, sessionId, sessionLogKey: generateSessionLogKey() },
      kmsService
    );

    const session = await agentVaultSessionDAL.transaction(async (tx) => {
      const created = await agentVaultSessionDAL.createWithId(
        {
          id: sessionId,
          projectId,
          userId: actor.type === ActorType.USER ? actor.id : null,
          identityId: actor.type === ActorType.IDENTITY ? actor.id : null,
          actorType:
            actor.type === ActorType.IDENTITY ? AgentVaultMemberType.MachineIdentity : AgentVaultMemberType.User,
          actorName,
          actorEmail,
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
        expiresAt: session.expiresAt ?? null,
        createdAt: session.createdAt,
        accessBundles: accessBundles.map((name, position) => ({
          id: bundlesByName.get(name)!.id,
          name,
          position
        }))
      },
      token
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

    // A concurrent revoke won. Report its timestamp rather than the one this request read.
    const current = await agentVaultSessionDAL.findOne({ id: session.id, projectId });
    return {
      session: toSessionView({ ...session, revokedAt: current?.revokedAt ?? session.revokedAt }),
      revokedNow: false
    };
  };

  return {
    mintSession,
    listSessions,
    getSessionById,
    revokeSession
  };
};
