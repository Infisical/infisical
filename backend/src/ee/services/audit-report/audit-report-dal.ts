import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

import { AuditReportStatus } from "./audit-report-types";

export type TAuditReportDALFactory = ReturnType<typeof auditReportDALFactory>;

const IN_FLIGHT_STATUSES = [AuditReportStatus.Pending, AuditReportStatus.Processing];

export const auditReportDALFactory = (db: TDbClient) => {
  const auditReportOrm = ormify(db, TableName.AuditReport);

  const findByProject = async (
    projectId: string,
    { offset = 0, limit = 50 }: { offset?: number; limit?: number },
    tx?: Knex
  ) => {
    try {
      const docs = await (tx || db.replicaNode())(TableName.AuditReport)
        .where(`${TableName.AuditReport}.projectId`, projectId)
        .orderBy(`${TableName.AuditReport}.createdAt`, "desc")
        .offset(offset)
        .limit(limit);
      return docs;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByProject - Audit Report" });
    }
  };

  const countByProject = async (projectId: string, tx?: Knex) => {
    try {
      const result = await (tx || db.replicaNode())(TableName.AuditReport)
        .where(`${TableName.AuditReport}.projectId`, projectId)
        .count("* as count")
        .first<{ count: string | number } | undefined>();
      return Number(result?.count ?? 0);
    } catch (error) {
      throw new DatabaseError({ error, name: "CountByProject - Audit Report" });
    }
  };

  const countInFlightByProject = async (projectId: string, tx?: Knex) => {
    try {
      const result = await (tx || db.replicaNode())(TableName.AuditReport)
        .where(`${TableName.AuditReport}.projectId`, projectId)
        .whereIn(`${TableName.AuditReport}.status`, IN_FLIGHT_STATUSES)
        .count("* as count")
        .first<{ count: string | number } | undefined>();
      return Number(result?.count ?? 0);
    } catch (error) {
      throw new DatabaseError({ error, name: "CountInFlightByProject - Audit Report" });
    }
  };

  return {
    ...auditReportOrm,
    findByProject,
    countByProject,
    countInFlightByProject
  };
};
