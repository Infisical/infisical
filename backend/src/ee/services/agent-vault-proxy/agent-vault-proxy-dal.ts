import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TAgentVaultProxies } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { sanitizeSqlLikeString } from "@app/lib/fn/string";
import { ormify } from "@app/lib/knex";

export type TAgentVaultProxyDALFactory = ReturnType<typeof agentVaultProxyDALFactory>;

export type TAgentVaultProxyWithOrg = TAgentVaultProxies & { orgId: string };

export const agentVaultProxyDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.AgentVaultProxy);

  // loginWithToken refuses a null orgId, so this path joins projects rather than denormalising a column.
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

  const findForList = async (
    {
      projectId,
      search,
      orderBy,
      orderDirection,
      limit,
      offset
    }: {
      projectId: string;
      search?: string;
      orderBy: "name" | "createdAt";
      orderDirection: "asc" | "desc";
      limit: number;
      offset: number;
    },
    tx?: Knex
  ): Promise<{ proxies: TAgentVaultProxies[]; totalCount: number }> => {
    try {
      const conn = tx || db.replicaNode();

      const applyFilters = (query: Knex.QueryBuilder) => {
        void query.where({ projectId });
        if (search) void query.whereILike("name", `%${sanitizeSqlLikeString(search)}%`);
        return query;
      };

      const countResult = (await applyFilters(conn(TableName.AgentVaultProxy)).count("id as count").first()) as
        | { count: string }
        | undefined;

      const proxies = (await applyFilters(conn(TableName.AgentVaultProxy))
        .orderBy(orderBy, orderDirection)
        .orderBy("name", "asc")
        .limit(limit)
        .offset(offset)) as TAgentVaultProxies[];

      return { proxies, totalCount: parseInt(countResult?.count || "0", 10) };
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault proxies" });
    }
  };

  // heartbeatTTL is copied from the row's own pollInterval in the same statement, so it records the
  // interval the proxy is about to be handed back rather than whatever the settings said earlier.
  const recordHeartbeat = async (id: string, tx?: Knex): Promise<TAgentVaultProxies | undefined> => {
    try {
      // Raw because the typed update builder will not take a column reference as a value, and copying
      // pollInterval across in one statement is the point: two statements could straddle a settings save.
      const updated = await (tx || db).raw<{ rows: TAgentVaultProxies[] }>(
        `UPDATE ?? SET "heartbeat" = ?, "heartbeatTTL" = "pollInterval" WHERE "id" = ? RETURNING *`,
        [TableName.AgentVaultProxy, new Date(), id]
      );
      return updated.rows[0];
    } catch (error) {
      throw new DatabaseError({ error, name: "Record agent vault proxy heartbeat" });
    }
  };

  const countByProjectId = async (projectId: string, tx?: Knex) => {
    try {
      const result = await (tx || db.replicaNode())(TableName.AgentVaultProxy).where({ projectId }).count("id").first();
      return parseInt(String(result?.count || "0"), 10);
    } catch (error) {
      throw new DatabaseError({ error, name: "Count agent vault proxies" });
    }
  };

  return { ...orm, findByIdWithOrg, findByIdInProject, findForList, recordHeartbeat, countByProjectId };
};
