import { Knex } from "knex";

import { ProjectType, TableName } from "@app/db/schemas";
import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";

import { TAgentVaultOauthAuthorization } from "../agent-vault-oauth/agent-vault-oauth-types";

type TResolverDeps = {
  db: Knex;
  keyStore: Pick<TKeyStoreFactory, "getItemPrimary">;
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

export const agentVaultProjectResolverFactory = ({ db, keyStore }: TResolverDeps) => {
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

  // A bridge for clients that predate projects (older CLIs and scripts send no projectId). Every one of them was
  // written while the org had a single project, which is the oldest one now. Remove after 2027-01-04 and make
  // projectId required.
  const resolveFallback = async (orgId: string, context: TAgentVaultFallbackContext) => {
    const projects = (await orgProjects(orgId)
      .orderBy([
        { column: "createdAt", order: "asc" },
        { column: "id", order: "asc" }
      ])
      .select("id")) as { id: string }[];
    if (!projects.length) {
      throw new BadRequestError({
        message:
          "This organization has no Agent Vault project yet. Create one in Infisical, then pass its ID as projectId."
      });
    }
    logger.info(
      {
        orgId,
        route: context.route,
        actorId: context.actorId,
        actorType: context.actorType,
        userAgent: context.userAgent,
        agentVaultProjectCount: projects.length
      },
      "agent-vault: request without projectId used the organization's oldest Agent Vault project"
    );
    return projects[0].id;
  };

  const resolve = async (orgId: string, projectId: string | undefined, context: TAgentVaultFallbackContext) =>
    projectId ? resolveExplicit(orgId, projectId) : resolveFallback(orgId, context);

  // Another org, a deleted project or a missing row all read as the resource's own 404, never as the permission
  // service's 403, which would confirm the id exists.
  const resolveFromRow = async (table: TRowTable, orgId: string, id: string) => {
    const row = (await db(table)
      .join(TableName.Project, `${table}.projectId`, `${TableName.Project}.id`)
      .where(`${table}.id`, id)
      .where(`${TableName.Project}.orgId`, orgId)
      .where(`${TableName.Project}.type`, ProjectType.AgentVault)
      .whereNull(`${TableName.Project}.deleteAfter`)
      .first(`${TableName.Project}.id as projectId`)) as { projectId: string } | undefined;
    if (!row) throw new NotFoundError({ message: ROW_NOT_FOUND[table](id) });
    return row.projectId;
  };

  const resolveFromAuthorization = async (orgId: string, authorizationId: string) => {
    const notFound = () =>
      new NotFoundError({
        message: `Authorization with ID '${authorizationId}' not found. It may have expired or was already used. Authorize the service again.`
      });
    const raw = await keyStore.getItemPrimary(KeyStorePrefixes.AgentVaultOauthAuthorization(authorizationId));
    if (!raw) throw notFound();
    const { projectId } = JSON.parse(raw) as TAgentVaultOauthAuthorization;
    const project = await findOrgProject(orgId, projectId);
    if (!project) throw notFound();
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
    resolveFromAccessBundle: (orgId: string, id: string) => resolveFromRow(TableName.AgentVaultAccessBundle, orgId, id),
    resolveFromSkill: (orgId: string, id: string) => resolveFromRow(TableName.AgentVaultSkill, orgId, id),
    resolveFromProxy: (orgId: string, id: string) => resolveFromRow(TableName.AgentVaultProxy, orgId, id),
    resolveFromSession: (orgId: string, id: string) => resolveFromRow(TableName.AgentVaultSession, orgId, id),
    resolveFromVariable: (orgId: string, id: string) => resolveFromRow(TableName.AgentVaultVariable, orgId, id),
    resolveFromAuthorization
  };
};
