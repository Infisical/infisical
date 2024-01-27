import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
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
    {
      orgId,
      projectId,
      userAgentType,
      startDate,
      endDate,
      limit = 20,
      offset = 0,
      actor,
      eventType
    }: TFindQuery,
    tx?: Knex
  ) => {
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
      sqlQuery.where("createdAt", ">=", startDate);
    }
    if (endDate) {
      sqlQuery.where("createdAt", "<=", endDate);
    }
    const docs = await sqlQuery;
    return docs;
  };

  return { ...auditLogOrm, find };
};
