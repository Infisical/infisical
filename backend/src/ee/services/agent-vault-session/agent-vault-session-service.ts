import { ForbiddenError } from "@casl/ability";

import { EventType, TAuditLogServiceFactory } from "@app/ee/services/audit-log/audit-log-types";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionAgentVaultSessionActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { ActorType } from "@app/services/auth/auth-type";

import {
  AGENT_VAULT_SESSION_TTL_SECONDS,
  AgentVaultSessionScope,
  AgentVaultSessionTtl
} from "../agent-vault/agent-vault-enums";
import { getAgentVaultReachability } from "../agent-vault/agent-vault-permission";
import { TAgentVaultAccessBundleDALFactory } from "../agent-vault-access-bundle/agent-vault-access-bundle-dal";
import { TAgentVaultAccessBundleMemberDALFactory } from "../agent-vault-member/agent-vault-access-bundle-member-dal";
import { TAgentVaultSessionAccessBundleDALFactory } from "./agent-vault-session-access-bundle-dal";
import { TAgentVaultSessionDALFactory } from "./agent-vault-session-dal";
import { deriveSessionStatus, generateSessionToken } from "./agent-vault-session-fns";
import { TListSessionsDTO, TMintSessionDTO, TRevokeSessionDTO } from "./agent-vault-session-types";

export const AGENT_VAULT_MAX_SESSION_BUNDLES = 16;

type TAgentVaultSessionServiceFactoryDep = {
  agentVaultSessionDAL: TAgentVaultSessionDALFactory;
  agentVaultSessionAccessBundleDAL: TAgentVaultSessionAccessBundleDALFactory;
  agentVaultAccessBundleDAL: Pick<TAgentVaultAccessBundleDALFactory, "find">;
  agentVaultAccessBundleMemberDAL: Pick<TAgentVaultAccessBundleMemberDALFactory, "findReachableAccessBundleIds">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
  keyStore: Pick<TKeyStoreFactory, "getItem" | "setItem">;
};

// Expired and revoked rows keep a month of history on the Sessions page, then go; nothing else outlives them.
const SESSION_RETENTION_DAYS = 30;
// The first sweep on a fresh instance looks back one day rather than over the whole table.
const FIRST_SWEEP_LOOKBACK_MS = 24 * 60 * 60 * 1000;

export type TAgentVaultSessionServiceFactory = ReturnType<typeof agentVaultSessionServiceFactory>;

export const agentVaultSessionServiceFactory = ({
  agentVaultSessionDAL,
  agentVaultSessionAccessBundleDAL,
  agentVaultAccessBundleDAL,
  agentVaultAccessBundleMemberDAL,
  permissionService,
  auditLogService,
  keyStore
}: TAgentVaultSessionServiceFactoryDep) => {
  // Only a person or a machine identity can hold a session; the actor comes from the request, never the
  // body, so nobody mints on someone else's behalf.
  const requireSessionActor = (ctx: TMintSessionDTO["ctx"]) => {
    if (ctx.actor !== ActorType.USER && ctx.actor !== ActorType.IDENTITY) {
      throw new BadRequestError({ message: "Only a user or machine identity can hold an Agent Vault session" });
    }
    return { type: ctx.actor, id: ctx.actorId };
  };

  const mintSession = async ({ projectId, ctx, accessBundleIds, ttl }: TMintSessionDTO) => {
    const actor = requireSessionActor(ctx);
    const { permission, accessBundleIds: reachable } = await getAgentVaultReachability(
      { permissionService, agentVaultAccessBundleMemberDAL },
      { projectId, ctx }
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentVaultSessionActions.Create,
      ProjectPermissionSub.AgentVaultSessions
    );

    if (!accessBundleIds.length) {
      throw new BadRequestError({ message: "Name at least one access bundle for the session" });
    }
    if (accessBundleIds.length > AGENT_VAULT_MAX_SESSION_BUNDLES) {
      throw new BadRequestError({
        message: `A session can carry at most ${AGENT_VAULT_MAX_SESSION_BUNDLES} access bundles`
      });
    }
    // Rejected rather than deduped: silently collapsing a duplicate would make the resulting priority
    // order something the caller did not ask for.
    if (new Set(accessBundleIds).size !== accessBundleIds.length) {
      throw new BadRequestError({ message: "The same access bundle is named more than once" });
    }

    const bundles = await agentVaultAccessBundleDAL.find({ projectId, $in: { id: accessBundleIds } });
    const bundlesById = new Map(bundles.map((bundle) => [bundle.id, bundle]));

    // Named-but-unreachable fails with the bundle named rather than being dropped, and the message is
    // the same whether the id is unknown or merely not granted, so this is not an existence oracle.
    const unreachable = accessBundleIds.find(
      (id) => !bundlesById.has(id) || (reachable !== null && !reachable.includes(id))
    );
    if (unreachable) {
      throw new BadRequestError({ message: `Access bundle '${unreachable}' is not one you can reach` });
    }

    const ttlSeconds = AGENT_VAULT_SESSION_TTL_SECONDS[ttl];
    const expiresAt = ttlSeconds === null ? null : new Date(Date.now() + ttlSeconds * 1000);
    const { token, tokenHash } = generateSessionToken();

    const session = await agentVaultSessionDAL.transaction(async (tx) => {
      const created = await agentVaultSessionDAL.create(
        {
          projectId,
          userId: actor.type === ActorType.USER ? actor.id : null,
          identityId: actor.type === ActorType.IDENTITY ? actor.id : null,
          tokenHash,
          expiresAt
        },
        tx
      );

      // Caller order becomes position, and position is what breaks the tie when two bundles cover the
      // same host. The bundle name is denormalised so the session still reads after a bundle is deleted.
      await agentVaultSessionAccessBundleDAL.insertMany(
        accessBundleIds.map((accessBundleId, position) => ({
          sessionId: created.id,
          accessBundleId,
          accessBundleName: bundlesById.get(accessBundleId)!.name,
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
        accessBundles: accessBundleIds.map((id, position) => ({
          id,
          name: bundlesById.get(id)!.name,
          position
        }))
      },
      // Returned exactly once. Nothing stores it, so there is no second chance to read it.
      token
    };
  };

  const listSessions = async ({ projectId, ctx, scope, status, limit, offset }: TListSessionsDTO) => {
    const { permission, isAdmin } = await getAgentVaultReachability(
      { permissionService, agentVaultAccessBundleMemberDAL },
      { projectId, ctx }
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentVaultSessionActions.Read,
      ProjectPermissionSub.AgentVaultSessions
    );

    // The CASL read action alone would let any member list everyone's sessions, so the scope widening is
    // checked here rather than left to the ability.
    if (scope === AgentVaultSessionScope.All && !isAdmin) {
      throw new ForbiddenRequestError({ message: "Only an Agent Vault administrator can list everyone's sessions" });
    }

    const actor = scope === AgentVaultSessionScope.All ? undefined : requireSessionActor(ctx);
    const { sessions, totalCount } = await agentVaultSessionDAL.findForList({
      projectId,
      actor,
      status,
      limit,
      offset
    });

    return {
      sessions: sessions.map((session) => ({ ...session, status: deriveSessionStatus(session) })),
      totalCount
    };
  };

  const revokeSession = async ({ projectId, ctx, sessionId }: TRevokeSessionDTO) => {
    const { permission, isAdmin } = await getAgentVaultReachability(
      { permissionService, agentVaultAccessBundleMemberDAL },
      { projectId, ctx }
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentVaultSessionActions.Revoke,
      ProjectPermissionSub.AgentVaultSessions
    );

    const session = await agentVaultSessionDAL.findOne({ id: sessionId, projectId });
    if (!session) throw new NotFoundError({ message: `Session with ID '${sessionId}' not found` });

    // The CASL action on its own would let any member revoke any other member's live session, so revoke
    // is owner-or-admin.
    const isOwner =
      (ctx.actor === ActorType.USER && session.userId === ctx.actorId) ||
      (ctx.actor === ActorType.IDENTITY && session.identityId === ctx.actorId);
    if (!isOwner && !isAdmin) {
      throw new NotFoundError({ message: `Session with ID '${sessionId}' not found` });
    }

    // Idempotent: revoking twice is not an error, and the first revocation time is the one that matters.
    if (session.revokedAt) return session;

    return agentVaultSessionDAL.updateById(session.id, { revokedAt: new Date() });
  };

  // Expiry itself needs no sweep: status is derived at read time and the proxy drops its own cache entry.
  // This exists for two things only: the session-expire audit event, emitted once per session by moving a
  // watermark forward, and hard-deleting rows a month after they stopped working.
  const sweepRetiredSessions = async () => {
    const now = new Date();
    const watermark = await keyStore.getItem(KeyStorePrefixes.AgentVaultSessionExpireSweep);
    const since = watermark ? new Date(watermark) : new Date(now.getTime() - FIRST_SWEEP_LOOKBACK_MS);

    const expired = await agentVaultSessionDAL.findExpiredBetween(since, now);
    for await (const session of expired) {
      await auditLogService.createAuditLog({
        projectId: session.projectId,
        actor: { type: ActorType.PLATFORM, metadata: {} },
        event: {
          type: EventType.AGENT_VAULT_SESSION_EXPIRE,
          metadata: { sessionId: session.id, expiresAt: session.expiresAt!.toISOString() }
        }
      });
    }
    await keyStore.setItem(KeyStorePrefixes.AgentVaultSessionExpireSweep, now.toISOString());

    const cutoff = new Date(now.getTime() - SESSION_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const pruned = await agentVaultSessionDAL.pruneRetiredBefore(cutoff);
    logger.info(
      `agent-vault: session sweep emitted ${expired.length} expire event(s) and pruned ${pruned} retired session(s)`
    );
  };

  return {
    mintSession,
    listSessions,
    revokeSession,
    sweepRetiredSessions,
    ttlOptions: Object.values(AgentVaultSessionTtl)
  };
};
