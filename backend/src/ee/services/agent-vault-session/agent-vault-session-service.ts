import { ForbiddenError } from "@casl/ability";

import { ActionProjectType, ProjectMembershipRole } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionAgentVaultSessionActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { ms } from "@app/lib/ms";
import { ActorType } from "@app/services/auth/auth-type";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";

import { AgentVaultSessionScope } from "../agent-vault/agent-vault-enums";
import { getAgentVaultReachability } from "../agent-vault/agent-vault-permission";
import { TAgentVaultAccessBundleDALFactory } from "../agent-vault-access-bundle/agent-vault-access-bundle-dal";
import { TAgentVaultSessionAccessBundleDALFactory } from "./agent-vault-session-access-bundle-dal";
import { TAgentVaultSessionDALFactory } from "./agent-vault-session-dal";
import { deriveSessionStatus, generateSessionToken } from "./agent-vault-session-fns";
import { TListSessionsDTO, TMintSessionDTO, TRevokeSessionDTO } from "./agent-vault-session-types";

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
};

const SESSION_RETENTION_DAYS = 30;

export type TAgentVaultSessionServiceFactory = ReturnType<typeof agentVaultSessionServiceFactory>;

export const agentVaultSessionServiceFactory = ({
  agentVaultSessionDAL,
  agentVaultSessionAccessBundleDAL,
  agentVaultAccessBundleDAL,
  membershipDAL,
  permissionService
}: TAgentVaultSessionServiceFactoryDep) => {
  const requireSessionActor = (ctx: TMintSessionDTO["ctx"]) => {
    if (ctx.actor !== ActorType.USER && ctx.actor !== ActorType.IDENTITY) {
      throw new BadRequestError({ message: "Only a user or machine identity can hold an Agent Vault session" });
    }
    return { type: ctx.actor, id: ctx.actorId };
  };

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
      throw new BadRequestError({ message: "Name the access bundle the session should carry" });
    }
    if (accessBundles.length > AGENT_VAULT_MAX_SESSION_BUNDLES) {
      throw new BadRequestError({ message: "A session carries one access bundle. Name a single bundle." });
    }
    if (new Set(accessBundles).size !== accessBundles.length) {
      throw new BadRequestError({ message: "The same access bundle is named more than once. Name it once." });
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

    const session = await agentVaultSessionDAL.transaction(async (tx) => {
      const created = await agentVaultSessionDAL.create(
        {
          projectId,
          userId: actor.type === ActorType.USER ? actor.id : null,
          identityId: actor.type === ActorType.IDENTITY ? actor.id : null,
          actorName,
          actorEmail,
          tokenHash,
          expiresAt
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

  const getSessionAuthority = async ({ projectId, ctx }: { projectId: string; ctx: TListSessionsDTO["ctx"] }) => {
    const { permission, hasRole } = await permissionService.getProjectPermission({
      actor: ctx.actor,
      actorId: ctx.actorId,
      projectId,
      actorAuthMethod: ctx.actorAuthMethod,
      actorOrgId: ctx.actorOrgId,
      actionProjectType: ActionProjectType.AgentVault
    });
    return { permission, isAdmin: hasRole(ProjectMembershipRole.Admin) };
  };

  const listSessions = async ({ projectId, ctx, scope, status, search, limit, offset }: TListSessionsDTO) => {
    const { permission, isAdmin } = await getSessionAuthority({ projectId, ctx });
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
      status,
      search,
      limit,
      offset
    });

    return {
      sessions: sessions.map((session) => ({ ...session, status: deriveSessionStatus(session) })),
      totalCount
    };
  };

  const revokeSession = async ({ projectId, ctx, sessionId }: TRevokeSessionDTO) => {
    const { permission, isAdmin } = await getSessionAuthority({ projectId, ctx });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentVaultSessionActions.Revoke,
      ProjectPermissionSub.AgentVaultSessions
    );

    const session = await agentVaultSessionDAL.findOne({ id: sessionId, projectId });
    if (!session) throw new NotFoundError({ message: `Session with ID '${sessionId}' not found` });

    // The CASL action alone would let any member revoke another member's session.
    const isOwner =
      (ctx.actor === ActorType.USER && session.userId === ctx.actorId) ||
      (ctx.actor === ActorType.IDENTITY && session.identityId === ctx.actorId);
    if (!isOwner && !isAdmin) {
      throw new NotFoundError({ message: `Session with ID '${sessionId}' not found` });
    }

    // The row type leaves nullable columns optional; the response contract does not.
    const withStatus = (row: typeof session) => {
      const normalized = {
        ...row,
        userId: row.userId ?? null,
        identityId: row.identityId ?? null,
        actorEmail: row.actorEmail ?? null,
        expiresAt: row.expiresAt ?? null,
        revokedAt: row.revokedAt ?? null
      };
      return { ...normalized, status: deriveSessionStatus(normalized) };
    };

    // revokedNow lets the caller audit a real revocation without auditing a repeat. Revoking twice stays a
    // 200 with the original revokedAt, so the second caller is not the one who revoked it.
    if (session.revokedAt) return { session: withStatus(session), revokedNow: false };

    const revoked = await agentVaultSessionDAL.revokeIfActive(session.id, new Date());
    if (revoked) return { session: withStatus(revoked), revokedNow: true };

    // A concurrent revoke won. Report its timestamp rather than the one this request read.
    const current = await agentVaultSessionDAL.findOne({ id: session.id, projectId });
    return { session: withStatus(current ?? session), revokedNow: false };
  };

  // Expiry needs no sweep: it is enforced against the clock on every resolve and derived per row on read.
  const sweepRetiredSessions = async () => {
    const cutoff = new Date(Date.now() - SESSION_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const pruned = await agentVaultSessionDAL.pruneRetiredBefore(cutoff);
    logger.info(`agent-vault: session sweep pruned ${pruned} retired session(s)`);
  };

  return {
    mintSession,
    listSessions,
    revokeSession,
    sweepRetiredSessions
  };
};
