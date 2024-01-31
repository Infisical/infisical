import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, stripUndefinedInWhere } from "@app/lib/knex";

export type TAuditLogDALFactory = ReturnType<typeof auditLogDALFactory>;

type TFindQuery = {
  actor?: string;
  projectId?: string;
  orgId?: string;
  eventType?: string;
  startDate?: string;
  endDate?: string;
  userAgentType?: string;
  limit?: number;
  offset?: number;
};

export const auditLogDALFactory = (db: TDbClient) => {
  const auditLogOrm = ormify(db, TableName.AuditLog);

  const find = async (
    { orgId, projectId, userAgentType, startDate, endDate, limit = 20, offset = 0, actor, eventType }: TFindQuery,
    tx?: Knex
  ) => {
    try {
      const sqlQuery = (tx || db)(TableName.AuditLog)
        .where(
          stripUndefinedInWhere({
            projectId,
            orgId,
            eventType,
            actor,
            userAgentType
          })
        )
        .limit(limit)
        .offset(offset);
      if (startDate) {
        void sqlQuery.where("createdAt", ">=", startDate);
      }
      if (endDate) {
        void sqlQuery.where("createdAt", "<=", endDate);
      }
      const docs = await sqlQuery;
      return docs;
    } catch (error) {
      throw new DatabaseError({ error });
    }
  };

  // delete all audit log that have expired
  const pruneAuditLog = async (tx?: Knex) => {
    try {
      const today = new Date();
      const docs = await (tx || db)(TableName.AuditLog).where("expiresAt", "<", today).del();
      return docs;
    } catch (error) {
      throw new DatabaseError({ error, name: "PruneAuditLog" });
    }
  };

  return { ...auditLogOrm, pruneAuditLog, find };
};
