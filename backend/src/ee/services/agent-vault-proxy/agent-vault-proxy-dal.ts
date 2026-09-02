import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TAgentVaultProxies } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TAgentVaultProxyDALFactory = ReturnType<typeof agentVaultProxyDALFactory>;

/** The proxy plus the org it belongs to. The table carries only projectId; the auth framework wants orgId. */
export type TAgentVaultProxyWithOrg = TAgentVaultProxies & { orgId: string };

export const agentVaultProxyDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.AgentVaultProxy);

  // resource-auth-method's $loadResource returns { id, name, orgId, identityId } and loginWithToken
  // refuses a null orgId, so every lookup on that path joins projects rather than denormalising a column.
  const findByIdWithOrg = async (id: string, tx?: Knex): Promise<TAgentVaultProxyWithOrg | undefined> => {
    try {
      const row = (await (tx || db.replicaNode())(TableName.AgentVaultProxy)
        .where(`${TableName.AgentVaultProxy}.id`, id)
        .join(TableName.Project, `${TableName.AgentVaultProxy}.projectId`, `${TableName.Project}.id`)
        .select(db.ref("orgId").withSchema(TableName.Project))
        .select(`${TableName.AgentVaultProxy}.*`)
        .first()) as TAgentVaultProxyWithOrg | undefined;
      return row;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault proxy with org" });
    }
  };

  const findByIdInProject = async (
    { id, projectId }: { id: string; projectId: string },
    tx?: Knex
  ): Promise<TAgentVaultProxies | undefined> => {
    try {
      return await (tx || db.replicaNode())(TableName.AgentVaultProxy).where({ id, projectId }).first();
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault proxy by id" });
    }
  };

  const findForProject = async (projectId: string, tx?: Knex): Promise<TAgentVaultProxies[]> => {
    try {
      return (await (tx || db.replicaNode())(TableName.AgentVaultProxy)
        .where({ projectId })
        .orderBy("name", "asc")) as TAgentVaultProxies[];
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault proxies" });
    }
  };

  return { ...orm, findByIdWithOrg, findByIdInProject, findForProject };
};
