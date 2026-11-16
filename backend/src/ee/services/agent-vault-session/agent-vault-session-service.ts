import { ForbiddenError } from "@casl/ability";
import { Knex } from "knex";

import { TLicenseService } from "@app/domains/platform/license/ce/module";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionAgentVaultSessionActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { PgSqlLock } from "@app/keystore/keystore";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { ms } from "@app/lib/ms";
import { ActorType } from "@app/services/auth/auth-type";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TResourceMetadataDALFactory } from "@app/services/resource-metadata/resource-metadata-dal";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { TAgentVaultAccessBundleDALFactory } from "../agent-vault-access-bundle/agent-vault-access-bundle-dal";
import { TAgentVaultServiceDALFactory } from "../agent-vault-access-bundle/agent-vault-service-dal";
import { TAgentVaultDelegationDALFactory } from "../agent-vault-delegation/agent-vault-delegation-dal";
import { findCallerDelegation, resolveOnBehalfOfUser } from "../agent-vault-delegation/agent-vault-on-behalf-of-fns";
import { generateSessionLogKey, wrapSessionLogKey } from "../agent-vault-session-log/agent-vault-session-log-secrets";
import { AgentVaultMemberType, AgentVaultSessionScope } from "../agent-vault/agent-vault-enums";
import { assertAgentVaultHooksOnPlan } from "../agent-vault/agent-vault-hook-fns";
import { getAgentVaultPermission, getAgentVaultReachability } from "../agent-vault/agent-vault-permission";
import { TAgentVaultSessionAccessBundleDALFactory } from "./agent-vault-session-access-bundle-dal";
import { TAgentVaultSessionDALFactory, TAgentVaultSessionListRow } from "./agent-vault-session-dal";
import {
  deriveSessionStatus,
  generateSessionToken,
  isSameSessionMetadata,
  TAgentVaultSessionMetadata
} from "./agent-vault-session-fns";
import {
  TAgentVaultInlineServiceInsert,
  TAgentVaultSessionInlineServiceDALFactory
} from "./agent-vault-session-inline-service-dal";
import {
  assertNoAccessBundleConflicts,
  prepareInlineServices,
  toInlineServiceSummary
} from "./agent-vault-session-inline-service-fns";
import {
  TAgentVaultInlineServiceSummary,
  TGetSessionByIdDTO,
  TListSessionsDTO,
  TMintSessionDTO,
  TRevokeSessionDTO,
  TUpdateSessionDTO
} from "./agent-vault-session-types";

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
  agentVaultSessionInlineServiceDAL: Pick<
    TAgentVaultSessionInlineServiceDALFactory,
    "insertForSession" | "findSummariesBySessionIds" | "deleteSecretsBySessionId"
  >;
  agentVaultAccessBundleDAL: Pick<TAgentVaultAccessBundleDALFactory, "find">;
  agentVaultServiceDAL: Pick<TAgentVaultServiceDALFactory, "findByAccessBundleId">;
  agentVaultDelegationDAL: Pick<TAgentVaultDelegationDALFactory, "findForIdentity" | "coversUser">;
  resourceMetadataDAL: Pick<TResourceMetadataDALFactory, "find" | "insertMany" | "delete">;
  membershipDAL: Pick<TMembershipDALFactory, "findResourceMembershipsForActor">;
  userDAL: Pick<TUserDALFactory, "findOne">;
  orgDAL: Pick<TOrgDALFactory, "findEffectiveOrgMembership">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  kmsService: Pick<TKmsServiceFactory, "wrapKey" | "createCipherPairWithDataKey">;
  licenseService: Pick<TLicenseService, "getPlan">;
};

export type TAgentVaultSessionServiceFactory = ReturnType<typeof agentVaultSessionServiceFactory>;

export const agentVaultSessionServiceFactory = ({
  agentVaultSessionDAL,
  agentVaultSessionAccessBundleDAL,
  agentVaultSessionInlineServiceDAL,
  agentVaultAccessBundleDAL,
  agentVaultServiceDAL,
  agentVaultDelegationDAL,
  resourceMetadataDAL,
  membershipDAL,
  userDAL,
  orgDAL,
  permissionService,
  kmsService,
  licenseService
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

  // Rows written by one statement share a createdAt, so each gets its own, one millisecond apart, to keep the
  // order the keys were sent in.
  const insertSessionMetadata = async (
    { orgId, sessionId, metadata }: { orgId: string; sessionId: string; metadata: TAgentVaultSessionMetadata },
    tx: Knex
  ) => {
    const now = Date.now();
    const rows = Object.entries(metadata).map(([key, value], index) => ({
      key,
      value,
      orgId,
      agentVaultSessionId: sessionId,
      createdAt: new Date(now + index)
    }));
    await resourceMetadataDAL.insertMany(rows, tx);
  };

  const findSessionMetadata = async (sessionIds: string[], tx?: Knex) => {
    const entriesBySession = new Map<string, [string, string][]>();
    if (!sessionIds.length) return new Map<string, TAgentVaultSessionMetadata>();
    const rows = await resourceMetadataDAL.find(
      { $in: { agentVaultSessionId: sessionIds } },
      {
        sort: [
          ["createdAt", "asc"],
          ["id", "asc"]
        ],
        tx
      }
    );
    rows.forEach((row) => {
      const entries = entriesBySession.get(row.agentVaultSessionId!);
      if (entries) entries.push([row.key, row.value ?? ""]);
      else entriesBySession.set(row.agentVaultSessionId!, [[row.key, row.value ?? ""]]);
    });
    return new Map(
      [...entriesBySession].map(([sessionId, entries]): [string, TAgentVaultSessionMetadata] => [
        sessionId,
        Object.fromEntries(entries)
      ])
    );
  };

  const withMetadata = async <T extends { id: string }>(sessions: T[]) => {
    const bySession = await findSessionMetadata(sessions.map((session) => session.id));
    return sessions.map((session) => ({ ...session, metadata: bySession.get(session.id) ?? {} }));
  };

  const withInlineServices = async <T extends { id: string }>(sessions: T[]) => {
    const rows = await agentVaultSessionInlineServiceDAL.findSummariesBySessionIds(
      sessions.map((session) => session.id)
    );
    const bySession = new Map<string, TAgentVaultInlineServiceSummary[]>();
    rows.forEach((row) => {
      const summaries = bySession.get(row.sessionId);
      if (summaries) summaries.push(toInlineServiceSummary(row));
      else bySession.set(row.sessionId, [toInlineServiceSummary(row)]);
    });
    return sessions.map((session) => ({ ...session, services: bySession.get(session.id) ?? [] }));
  };

  const resolveSessionTtl = (ttl: string | undefined, isOnBehalfOf: boolean) =>
    ttl ?? (isOnBehalfOf ? AGENT_VAULT_ON_BEHALF_OF_SESSION_DEFAULT_TTL : AGENT_VAULT_SESSION_DEFAULT_TTL);

  const mintSession = async ({
    projectId,
    ctx,
    accessBundle,
    services = [],
    actorName,
    actorEmail,
    ttl: requestedTtl,
    onBehalfOf,
    label,
    metadata = {}
  }: TMintSessionDTO) => {
    const caller = requireSessionActor(ctx);
    // The rest of mint, the junction table and resolve all work on a list; a session holds at most one bundle.
    const accessBundles = accessBundle ? [accessBundle] : [];
    const ttl = resolveSessionTtl(requestedTtl, Boolean(onBehalfOf));

    const { permission, isAdmin } = await getAgentVaultPermission({ permissionService }, { projectId, ctx });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentVaultSessionActions.Create,
      ProjectPermissionSub.AgentVaultSessions
    );

    if (!accessBundles.length && !services.length) {
      throw new BadRequestError({
        message: "Name the access bundle this session should carry, or send the services it should reach."
      });
    }
    // An inline service names its own hosts and credentials, which is an admin's call, as it is for a bundle's services.
    if (services.length && !isAdmin) {
      throw new ForbiddenRequestError({
        message: "Only an Agent Vault admin can send services with a session. Name an access bundle instead."
      });
    }

    const preparedInlineServices = prepareInlineServices(services);
    if (preparedInlineServices.some((service) => service.hookUrl)) {
      await assertAgentVaultHooksOnPlan(licenseService, ctx.actorOrgId);
    }

    const bundles = accessBundles.length
      ? await agentVaultAccessBundleDAL.find({ projectId, $in: { name: accessBundles } })
      : [];
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
          name: "AccessBundleNotGranted",
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
          name: "AccessBundleNotGranted",
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
          name: "AccessBundleNotGranted",
          message: `No access bundle named '${notGranted}' is granted to you. Check the name, or ask an Agent Vault admin to grant it.`
        });
      }
    }

    // A fast failure only: the check that counts runs again in the transaction, under the lock renames take.
    const assertNoBundleConflicts = async (tx?: Knex) => {
      if (!preparedInlineServices.length) return;
      for (const name of accessBundles) {
        const bundle = bundlesByName.get(name)!;
        // eslint-disable-next-line no-await-in-loop
        const bundleServices = await agentVaultServiceDAL.findByAccessBundleId(bundle.id, tx);
        assertNoAccessBundleConflicts(preparedInlineServices, { name: bundle.name, services: bundleServices });
      }
    };
    await assertNoBundleConflicts();

    // Sealed before the transaction: with an external KMS this is a network call, and the transaction stays short.
    // Each value is sealed on its own, the way a project's services keep them, so the two can share one table.
    let seal: ((value: unknown) => Buffer) | null = null;
    if (preparedInlineServices.some((service) => service.secrets)) {
      const { encryptor } = await kmsService.createCipherPairWithDataKey({
        type: KmsDataKey.SecretManager,
        projectId
      });
      seal = (value) => encryptor({ plainText: Buffer.from(JSON.stringify(value)) }).cipherTextBlob;
    }
    const inlineServiceRows: TAgentVaultInlineServiceInsert[] = preparedInlineServices.map(
      ({ secrets, customHeaders, substitutions, ...service }) => ({
        ...service,
        projectId,
        credentialType: service.credentialConfig.type,
        encryptedCredential: secrets?.credential ? seal!(secrets.credential) : null,
        encryptedHookSecret: secrets?.hookSecret ? seal!({ value: secrets.hookSecret }) : null,
        customHeaders: customHeaders.map((header, index) => ({
          ...header,
          encryptedValue: seal!({ value: secrets!.customHeaders[index] })
        })),
        substitutions: substitutions.map((substitution, index) => ({
          ...substitution,
          encryptedValue: seal!({ value: secrets!.substitutions[index] })
        }))
      })
    );

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

    const { session, insertedInlineServices } = await agentVaultSessionDAL.transaction(async (tx) => {
      if (preparedInlineServices.length && accessBundles.length) {
        await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.AgentVaultServiceNames(projectId)]);
        await assertNoBundleConflicts(tx);
      }
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

      const inserted = await agentVaultSessionInlineServiceDAL.insertForSession(
        { sessionId: created.id, services: inlineServiceRows },
        tx
      );

      await insertSessionMetadata({ orgId: ctx.actorOrgId, sessionId: created.id, metadata }, tx);

      return { session: created, insertedInlineServices: inserted };
    });

    return {
      session: {
        id: session.id,
        label: session.label ?? null,
        metadata,
        expiresAt: session.expiresAt ?? null,
        createdAt: session.createdAt,
        accessBundle: accessBundle ? { id: bundlesByName.get(accessBundle)!.id, name: accessBundle } : null,
        services: insertedInlineServices
          .sort((a, b) => a.position - b.position)
          .map((row) => toInlineServiceSummary(row))
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

    return { sessions: await withMetadata(await withInlineServices(sessions.map(toSessionView))), totalCount };
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

    const [session] = await withMetadata(
      await withInlineServices([toSessionView(await findVisibleSession({ projectId, ctx, sessionId, isAdmin }))])
    );
    return { session };
  };

  const revokeSession = async ({ projectId, ctx, sessionId }: TRevokeSessionDTO) => {
    const { permission, isAdmin } = await getAgentVaultPermission({ permissionService }, { projectId, ctx });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentVaultSessionActions.Revoke,
      ProjectPermissionSub.AgentVaultSessions
    );

    const session = await findVisibleSession({ projectId, ctx, sessionId, isAdmin });

    const metadata = (await findSessionMetadata([session.id])).get(session.id) ?? {};

    // revokedNow lets the caller audit a real revocation without auditing a repeat. Revoking twice stays a
    // 200 with the original revokedAt, so the second caller is not the one who revoked it.
    if (session.revokedAt) return { session: { ...toSessionView(session), metadata }, revokedNow: false };

    // The timestamp comes from the written row: a read-back could land on a replica that has not seen it.
    const revoked = await agentVaultSessionDAL.transaction(async (tx) => {
      const row = await agentVaultSessionDAL.revokeIfActive(session.id, new Date(), tx);
      // Revoked by this call or found already over, the session can't use its inline services' secrets again.
      await agentVaultSessionInlineServiceDAL.deleteSecretsBySessionId(session.id, tx);
      return row;
    });
    if (revoked) {
      return {
        session: { ...toSessionView({ ...session, revokedAt: revoked.revokedAt ?? null }), metadata },
        revokedNow: true
      };
    }

    // Nothing was written: a concurrent revoke won, or the owner or the user it acts for was deleted, which already
    // reads as revoked and is left untouched. Report the row as it is now, which the read above may not have seen.
    const current = await agentVaultSessionDAL.findByIdOnPrimary(session.id, projectId);
    return {
      session: {
        ...toSessionView(
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
        metadata
      },
      revokedNow: false
    };
  };

  const updateSession = async ({ projectId, ctx, sessionId, label, metadata }: TUpdateSessionDTO) => {
    const { permission, isAdmin } = await getAgentVaultPermission({ permissionService }, { projectId, ctx });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentVaultSessionActions.Edit,
      ProjectPermissionSub.AgentVaultSessions
    );

    const session = await findVisibleSession({ projectId, ctx, sessionId, isAdmin });
    // The visible session can come from a replica that lags, so the owner check, the previous label and the previous
    // metadata come from the write itself, which holds the session's row lock until the metadata is written too.
    type TEditResult = {
      written: { previousLabel: string | null; isEditable: boolean } | undefined;
      metadataChanged: boolean;
      currentMetadata: TAgentVaultSessionMetadata;
    };
    const result = await agentVaultSessionDAL.transaction(async (tx): Promise<TEditResult> => {
      let written: TEditResult["written"];
      if (label === undefined) {
        written = await agentVaultSessionDAL.lockForEdit(session.id, projectId, tx);
      } else {
        const row = await agentVaultSessionDAL.updateLabel(session.id, projectId, label, tx);
        written = row && { previousLabel: row.previousLabel, isEditable: row.isUpdated };
      }
      if (!written?.isEditable) return { written, metadataChanged: false, currentMetadata: {} };

      const previousMetadata = (await findSessionMetadata([session.id], tx)).get(session.id) ?? {};
      if (!metadata || isSameSessionMetadata(previousMetadata, metadata)) {
        return { written, metadataChanged: false, currentMetadata: previousMetadata };
      }
      await resourceMetadataDAL.delete({ agentVaultSessionId: session.id }, tx);
      await insertSessionMetadata({ orgId: ctx.actorOrgId, sessionId: session.id, metadata }, tx);
      return { written, metadataChanged: true, currentMetadata: metadata };
    });

    if (!result.written) throw new NotFoundError({ message: `Session with ID '${sessionId}' not found` });
    if (!result.written.isEditable) {
      throw new BadRequestError({
        message:
          "The user or machine identity that owned this session, or the user it was started on behalf of, was deleted, so its label and metadata can't be changed."
      });
    }

    const { previousLabel } = result.written;
    const currentLabel = label === undefined ? previousLabel : label;
    const [view] = await withInlineServices([toSessionView({ ...session, label: currentLabel })]);
    return {
      session: { ...view, metadata: result.currentMetadata },
      previousLabel,
      isChanged: currentLabel !== previousLabel || result.metadataChanged
    };
  };

  return {
    mintSession,
    listSessions,
    getSessionById,
    revokeSession,
    updateSession
  };
};
