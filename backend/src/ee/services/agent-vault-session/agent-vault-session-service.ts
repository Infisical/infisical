import { ForbiddenError } from "@casl/ability";

import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionAgentVaultSessionActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { ActorType } from "@app/services/auth/auth-type";

import { TAgentVaultAccessBundleDALFactory } from "../agent-vault-access-bundle/agent-vault-access-bundle-dal";
import {
  AGENT_VAULT_SESSION_TTL_SECONDS,
  AgentVaultSessionScope,
  AgentVaultSessionTtl
} from "../agent-vault/agent-vault-enums";
import { getAgentVaultReachability } from "../agent-vault/agent-vault-permission";
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
};

export type TAgentVaultSessionServiceFactory = ReturnType<typeof agentVaultSessionServiceFactory>;

export const agentVaultSessionServiceFactory = ({
  agentVaultSessionDAL,
  agentVaultSessionAccessBundleDAL,
  agentVaultAccessBundleDAL,
  agentVaultAccessBundleMemberDAL,
  permissionService
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
        expiresAt: session.expiresAt,
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

  return { mintSession, listSessions, revokeSession, ttlOptions: Object.values(AgentVaultSessionTtl) };
};
