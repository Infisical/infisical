import { Knex } from "knex";

import { ActionProjectType, ProjectType, TableName } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { TGenericPermission } from "@app/lib/types";

import { TAgentVaultOauthAuthorization } from "../agent-vault-oauth/agent-vault-oauth-types";

type TResolverDeps = {
  db: Knex;
  keyStore: Pick<TKeyStoreFactory, "getItemPrimary">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
};

export type TAgentVaultProjectResolverFactory = ReturnType<typeof agentVaultProjectResolverFactory>;

export type TAgentVaultFallbackContext = {
  route: string;
  actorId: string;
  actorType: string;
  userAgent?: string;
};

type TRowTable =
  | TableName.AgentVaultAccessBundle
  | TableName.AgentVaultSkill
  | TableName.AgentVaultProxy
  | TableName.AgentVaultSession
  | TableName.AgentVaultVariable;

const ROW_NOT_FOUND: Record<TRowTable, (id: string) => string> = {
  [TableName.AgentVaultAccessBundle]: (id) => `Access bundle with ID '${id}' not found`,
  [TableName.AgentVaultSkill]: (id) => `Skill with ID '${id}' not found`,
  [TableName.AgentVaultProxy]: (id) => `Proxy with ID '${id}' not found`,
  [TableName.AgentVaultSession]: (id) => `Session with ID '${id}' not found`,
  [TableName.AgentVaultVariable]: (id) => `Variable with ID '${id}' not found`
};

export const agentVaultProjectResolverFactory = ({ db, keyStore, permissionService }: TResolverDeps) => {
  // Every read here is on the primary: a project created a moment ago (signup creates one and opens it straight
  // away) may not be on a replica yet, and write services lock the addressed rows on the primary.
  const orgProjects = (orgId: string) =>
    db(TableName.Project).where({ orgId, type: ProjectType.AgentVault }).whereNull("deleteAfter");

  const findOrgProject = async (orgId: string, projectId: string) =>
    (await orgProjects(orgId).where({ id: projectId }).first("id")) as { id: string } | undefined;

  const resolveExplicit = async (orgId: string, projectId: string) => {
    const project = await findOrgProject(orgId, projectId);
    if (!project) {
      throw new NotFoundError({ message: `Agent Vault project with ID '${projectId}' not found in this organization` });
    }
    // The stored id, not the caller's spelling: services compare ids as strings.
    return project.id;
  };

  // A bridge for clients that predate projects (older CLIs and scripts send no projectId). They were written while the
  // org had a single project, so they go to that one (isAgentVaultOriginal), never to a project created since. Remove
  // after 2027-01-04 together with the column and make projectId required.
  const resolveFallback = async (orgId: string, context: TAgentVaultFallbackContext) => {
    const project = (await orgProjects(orgId).where({ isAgentVaultOriginal: true }).first("id")) as
      | { id: string }
      | undefined;
    if (!project) {
      throw new BadRequestError({
        message:
          "This request has no projectId. Pass the ID of the Agent Vault project to use as projectId, or update your Infisical CLI so it sends one."
      });
    }
    logger.info(
      `agent-vault: request without projectId used the organization's original Agent Vault project [orgId=${orgId}] [projectId=${project.id}] [route=${context.route}] [actorId=${context.actorId}] [actorType=${context.actorType}] [userAgent=${context.userAgent}]`
    );
    return project.id;
  };

  const resolve = async (orgId: string, projectId: string | undefined, context: TAgentVaultFallbackContext) =>
    projectId ? resolveExplicit(orgId, projectId) : resolveFallback(orgId, context);

  // Another org, a deleted project, a project the actor is not a member of or a missing row all read as the
  // resource's own 404, never as the permission service's 403, which would confirm the id exists.
  const assertMember = async (ctx: TGenericPermission, projectId: string, notFound: () => NotFoundError) => {
    try {
      await permissionService.getProjectPermission({
        actor: ctx.actor,
        actorId: ctx.actorId,
        projectId,
        actorAuthMethod: ctx.actorAuthMethod,
        actorOrgId: ctx.actorOrgId,
        actionProjectType: ActionProjectType.AgentVault
      });
    } catch (error) {
      if (error instanceof Error && error.name === "ProjectMembershipNotFound") throw notFound();
      throw error;
    }
  };

  const resolveFromRow = async (table: TRowTable, ctx: TGenericPermission, id: string) => {
    const notFound = () => new NotFoundError({ message: ROW_NOT_FOUND[table](id) });
    const row = (await db(table)
      .join(TableName.Project, `${table}.projectId`, `${TableName.Project}.id`)
      .where(`${table}.id`, id)
      .where(`${TableName.Project}.orgId`, ctx.actorOrgId)
      .where(`${TableName.Project}.type`, ProjectType.AgentVault)
      .whereNull(`${TableName.Project}.deleteAfter`)
      .first(`${TableName.Project}.id as projectId`)) as { projectId: string } | undefined;
    if (!row) throw notFound();
    await assertMember(ctx, row.projectId, notFound);
    return row.projectId;
  };

  const resolveFromAuthorization = async (ctx: TGenericPermission, authorizationId: string) => {
    const notFound = () =>
      new NotFoundError({
        message: `Authorization with ID '${authorizationId}' not found. It may have expired or was already used. Authorize the service again.`
      });
    const raw = await keyStore.getItemPrimary(KeyStorePrefixes.AgentVaultOauthAuthorization(authorizationId));
    if (!raw) throw notFound();
    const { projectId } = JSON.parse(raw) as TAgentVaultOauthAuthorization;
    const project = await findOrgProject(ctx.actorOrgId, projectId);
    if (!project) throw notFound();
    await assertMember(ctx, project.id, notFound);
    return project.id;
  };

  // Which of these ids are Agent Vault projects in the org, for callers that handle a mixed list of projects.
  const filterAgentVaultProjectIds = async (orgId: string, projectIds: string[]) => {
    if (!projectIds.length) return new Set<string>();
    const rows = (await orgProjects(orgId).whereIn("id", projectIds).select("id")) as { id: string }[];
    return new Set(rows.map((row) => row.id));
  };

  return {
    resolve,
    filterAgentVaultProjectIds,
    resolveFromAccessBundle: (ctx: TGenericPermission, id: string) =>
      resolveFromRow(TableName.AgentVaultAccessBundle, ctx, id),
    resolveFromSkill: (ctx: TGenericPermission, id: string) => resolveFromRow(TableName.AgentVaultSkill, ctx, id),
    resolveFromProxy: (ctx: TGenericPermission, id: string) => resolveFromRow(TableName.AgentVaultProxy, ctx, id),
    resolveFromSession: (ctx: TGenericPermission, id: string) => resolveFromRow(TableName.AgentVaultSession, ctx, id),
    resolveFromVariable: (ctx: TGenericPermission, id: string) => resolveFromRow(TableName.AgentVaultVariable, ctx, id),
    resolveFromAuthorization
  };
};
