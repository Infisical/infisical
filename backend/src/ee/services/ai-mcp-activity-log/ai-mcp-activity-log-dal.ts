import knex from "knex";

import { TDbClient } from "@app/db";
import { TableName, TAiMcpActivityLogs } from "@app/db/schemas";
import { DatabaseError, GatewayTimeoutError } from "@app/lib/errors";
import { ormify, selectAllTableCols, TOrmify } from "@app/lib/knex";

export type TFindActivityLogsQuery = {
  projectId: string;
  endpointName?: string;
  serverName?: string;
  toolName?: string;
  actor?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
};

export interface TAiMcpActivityLogDALFactory extends Omit<TOrmify<TableName.AiMcpActivityLog>, "find"> {
  find: (arg: TFindActivityLogsQuery, tx?: knex.Knex) => Promise<TAiMcpActivityLogs[]>;
}

export const aiMcpActivityLogDALFactory = (db: TDbClient): TAiMcpActivityLogDALFactory => {
  const aiMcpActivityLogOrm = ormify(db, TableName.AiMcpActivityLog);

  const find: TAiMcpActivityLogDALFactory["find"] = async (
    { projectId, endpointName, serverName, toolName, actor, startDate, endDate, limit = 20, offset = 0 },
    tx
  ) => {
    try {
      const sqlQuery = (tx || db.replicaNode())(TableName.AiMcpActivityLog).where(
        `${TableName.AiMcpActivityLog}.projectId`,
        projectId
      );

      // Apply date filters if provided
      if (startDate) {
        void sqlQuery.whereRaw(`"${TableName.AiMcpActivityLog}"."createdAt" >= ?::timestamptz`, [startDate]);
      }
      if (endDate) {
        void sqlQuery.andWhereRaw(`"${TableName.AiMcpActivityLog}"."createdAt" < ?::timestamptz`, [endDate]);
      }

      // Apply exact filters
      if (endpointName) {
        void sqlQuery.where(`${TableName.AiMcpActivityLog}.endpointName`, endpointName);
      }

      if (serverName) {
        void sqlQuery.where(`${TableName.AiMcpActivityLog}.serverName`, serverName);
      }

      if (toolName) {
        void sqlQuery.where(`${TableName.AiMcpActivityLog}.toolName`, toolName);
      }

      if (actor) {
        void sqlQuery.where(`${TableName.AiMcpActivityLog}.actor`, actor);
      }

      // Apply pagination and ordering
      void sqlQuery
        .select(selectAllTableCols(TableName.AiMcpActivityLog))
        .limit(limit)
        .offset(offset)
        .orderBy(`${TableName.AiMcpActivityLog}.createdAt`, "desc");

      // Timeout long running queries to prevent DB resource issues (2 minutes)
      const docs = await sqlQuery.timeout(1000 * 120);

      return docs;
    } catch (error) {
      if (error instanceof knex.KnexTimeoutError) {
        throw new GatewayTimeoutError({
          error,
          message: "Failed to fetch MCP activity logs due to timeout. Add more search filters."
        });
      }

      throw new DatabaseError({ error });
    }
  };

  return { ...aiMcpActivityLogOrm, find };
};
