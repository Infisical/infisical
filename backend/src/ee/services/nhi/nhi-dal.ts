import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export const nhiSourceDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.NhiSource);

  const findDueForScan = async (tx?: Knex) => {
    const dbInstance = tx || db;
    return dbInstance(TableName.NhiSource)
      .whereNotNull("scanSchedule")
      .andWhere((qb) => {
        void qb.whereNull("lastScheduledScanAt").orWhereRaw(
          `CASE "scanSchedule"
              WHEN '6h' THEN "lastScheduledScanAt" + interval '6 hours' < NOW()
              WHEN '12h' THEN "lastScheduledScanAt" + interval '12 hours' < NOW()
              WHEN 'daily' THEN "lastScheduledScanAt" + interval '1 day' < NOW()
              WHEN 'weekly' THEN "lastScheduledScanAt" + interval '7 days' < NOW()
              ELSE FALSE
            END`
        );
      })
      .select(selectAllTableCols(TableName.NhiSource));
  };

  return { ...orm, findDueForScan };
};

export const nhiIdentityDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.NhiIdentity);

  const findByProjectId = async (
    {
      projectId,
      search,
      riskLevel,
      type,
      sourceId,
      provider,
      status,
      ownerFilter,
      page = 1,
      limit = 50,
      sortBy = "riskScore",
      sortDir = "desc"
    }: {
      projectId: string;
      search?: string;
      riskLevel?: string;
      type?: string;
      sourceId?: string;
      provider?: string;
      status?: string;
      ownerFilter?: string;
      page: number;
      limit: number;
      sortBy?: string;
      sortDir?: "asc" | "desc";
    },
    tx?: Knex
  ) => {
    const dbInstance = tx || db.replicaNode();
    const query = dbInstance(TableName.NhiIdentity)
      .leftJoin(TableName.NhiSource, `${TableName.NhiIdentity}.sourceId`, `${TableName.NhiSource}.id`)
      .where(`${TableName.NhiIdentity}.projectId`, projectId)
      .select(selectAllTableCols(TableName.NhiIdentity))
      .select(dbInstance.ref("name").withSchema(TableName.NhiSource).as("sourceName"));

    if (search) {
      const escapedSearch = search.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
      const pattern = `%${escapedSearch}%`;
      void query.where((q) => {
        void q
          .whereRaw(`??.?? ILIKE ? ESCAPE '\\'`, [TableName.NhiIdentity, "name", pattern])
          .orWhereRaw(`??.?? ILIKE ? ESCAPE '\\'`, [TableName.NhiIdentity, "externalId", pattern]);
      });
    }

    if (riskLevel) {
      switch (riskLevel) {
        case "critical":
          void query.where(`${TableName.NhiIdentity}.riskScore`, ">=", 70);
          break;
        case "high":
          void query
            .where(`${TableName.NhiIdentity}.riskScore`, ">=", 40)
            .where(`${TableName.NhiIdentity}.riskScore`, "<", 70);
          break;
        case "medium":
          void query
            .where(`${TableName.NhiIdentity}.riskScore`, ">=", 20)
            .where(`${TableName.NhiIdentity}.riskScore`, "<", 40);
          break;
        case "low":
          void query.where(`${TableName.NhiIdentity}.riskScore`, "<", 20);
          break;
        default:
          break;
      }
    }

    if (type) {
      void query.where(`${TableName.NhiIdentity}.type`, type);
    }

    if (sourceId) {
      void query.where(`${TableName.NhiIdentity}.sourceId`, sourceId);
    }

    if (provider) {
      void query.where(`${TableName.NhiIdentity}.provider`, provider);
    }

    if (status) {
      void query.where(`${TableName.NhiIdentity}.status`, status);
    }

    if (ownerFilter === "assigned") {
      void query.whereNotNull(`${TableName.NhiIdentity}.ownerEmail`);
    } else if (ownerFilter === "unassigned") {
      void query.whereNull(`${TableName.NhiIdentity}.ownerEmail`);
    }

    const countQuery = query.clone().clearSelect().count("*", { as: "count" }).first();

    const allowedSortColumns = ["riskScore", "name", "type", "lastSeenAt", "lastActivityAt", "createdAt", "status"];
    const sortColumn = allowedSortColumns.includes(sortBy) ? sortBy : "riskScore";
    const direction = sortDir === "asc" ? "asc" : "desc";
    void query.orderBy(`${TableName.NhiIdentity}.${sortColumn}`, direction);

    const offset = (page - 1) * limit;
    void query.limit(limit).offset(offset);

    const [identities, countResult] = await Promise.all([query, countQuery]);
    const totalCount = Number(countResult?.count || 0);

    return { identities, totalCount };
  };

  const getStatsByProjectId = async (projectId: string, tx?: Knex) => {
    const dbInstance = tx || db.replicaNode();

    type TNhiStats = {
      total: number;
      criticalCount: number;
      highCount: number;
      mediumCount: number;
      lowCount: number;
      unownedCount: number;
      avgRiskScore: number;
    };

    const defaultStats: TNhiStats = {
      total: 0,
      criticalCount: 0,
      highCount: 0,
      mediumCount: 0,
      lowCount: 0,
      unownedCount: 0,
      avgRiskScore: 0
    };

    const result = (await dbInstance(TableName.NhiIdentity)
      .where(`${TableName.NhiIdentity}.projectId`, projectId)
      .select(
        dbInstance.raw("COUNT(*)::int as total"),
        dbInstance.raw('COUNT(*) FILTER (WHERE ?? >= 70)::int as "criticalCount"', [
          `${TableName.NhiIdentity}.riskScore`
        ]),
        dbInstance.raw('COUNT(*) FILTER (WHERE ?? >= 40 AND ?? < 70)::int as "highCount"', [
          `${TableName.NhiIdentity}.riskScore`,
          `${TableName.NhiIdentity}.riskScore`
        ]),
        dbInstance.raw('COUNT(*) FILTER (WHERE ?? >= 20 AND ?? < 40)::int as "mediumCount"', [
          `${TableName.NhiIdentity}.riskScore`,
          `${TableName.NhiIdentity}.riskScore`
        ]),
        dbInstance.raw('COUNT(*) FILTER (WHERE ?? < 20)::int as "lowCount"', [`${TableName.NhiIdentity}.riskScore`]),
        dbInstance.raw('COUNT(*) FILTER (WHERE ?? IS NULL)::int as "unownedCount"', [
          `${TableName.NhiIdentity}.ownerEmail`
        ]),
        dbInstance.raw('COALESCE(AVG(??), 0)::int as "avgRiskScore"', [`${TableName.NhiIdentity}.riskScore`])
      )
      .first()) as TNhiStats | undefined;

    return result || defaultStats;
  };

  return { ...orm, findByProjectId, getStatsByProjectId };
};

export const nhiScanDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.NhiScan);
  return orm;
};

export type TNhiSourceDALFactory = ReturnType<typeof nhiSourceDALFactory>;
export type TNhiIdentityDALFactory = ReturnType<typeof nhiIdentityDALFactory>;
export type TNhiScanDALFactory = ReturnType<typeof nhiScanDALFactory>;
