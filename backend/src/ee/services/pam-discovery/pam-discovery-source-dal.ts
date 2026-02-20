import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TPamDiscoverySources } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";
import { OrderByDirection } from "@app/lib/types";

import { PamDiscoveryOrderBy, PamDiscoveryRunStatus } from "./pam-discovery-enums";

export type TPamDiscoverySourceDALFactory = ReturnType<typeof pamDiscoverySourceDALFactory>;

export const pamDiscoverySourceDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.PamDiscoverySource);

  const findByProjectId = async (
    projectId: string,
    {
      offset = 0,
      limit = 25,
      search,
      orderBy = PamDiscoveryOrderBy.Name,
      orderDirection = OrderByDirection.ASC,
      filterDiscoveryTypes,
      tx
    }: {
      offset?: number;
      limit?: number;
      search?: string;
      orderBy?: PamDiscoveryOrderBy;
      orderDirection?: OrderByDirection;
      filterDiscoveryTypes?: string[];
      tx?: Knex;
    } = {}
  ) => {
    try {
      const dbInstance = tx || db.replicaNode();
      const query = dbInstance(TableName.PamDiscoverySource).where(
        `${TableName.PamDiscoverySource}.projectId`,
        projectId
      );

      if (search) {
        // escape special characters (`%`, `_`) and the escape character itself (`\`)
        const escapedSearch = search.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
        const pattern = `%${escapedSearch}%`;
        void query.where((q) => {
          void q
            .whereRaw(`??.?? ILIKE ? ESCAPE '\\'`, [TableName.PamDiscoverySource, "name", pattern])
            .orWhereRaw(`??.?? ILIKE ? ESCAPE '\\'`, [TableName.PamDiscoverySource, "discoveryType", pattern]);
        });
      }

      if (filterDiscoveryTypes && filterDiscoveryTypes.length) {
        void query.whereIn(`${TableName.PamDiscoverySource}.discoveryType`, filterDiscoveryTypes);
      }

      const countQuery = query.clone().count("*", { as: "count" }).first();

      void query.select(selectAllTableCols(TableName.PamDiscoverySource));

      const direction = orderDirection === OrderByDirection.ASC ? "ASC" : "DESC";

      void query.orderByRaw(`${TableName.PamDiscoverySource}.?? COLLATE "en-x-icu" ${direction}`, [orderBy]);

      if (typeof limit === "number") {
        void query.limit(limit).offset(offset);
      }

      const [sources, countResult] = await Promise.all([query, countQuery]);
      const totalCount = Number(countResult?.count || 0);

      return { sources, totalCount };
    } catch (error) {
      throw new DatabaseError({ error, name: "Find PAM Discovery Sources by project ID" });
    }
  };

  const findDueForScan = async (tx?: Knex) => {
    try {
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const docs = await (tx || db.replicaNode())(TableName.PamDiscoverySource)
        .where({ status: "active" })
        .andWhere((qb) => {
          void qb.where({ schedule: "daily" }).orWhere({ schedule: "weekly" });
        })
        .andWhere((qb) => {
          void qb
            .whereNull("lastRunAt")
            .orWhere((sub) => {
              void sub.where({ schedule: "daily" }).andWhere("lastRunAt", "<=", oneDayAgo);
            })
            .orWhere((sub) => {
              void sub.where({ schedule: "weekly" }).andWhere("lastRunAt", "<=", sevenDaysAgo);
            });
        })
        // Exclude sources that have a running scan
        .whereNotExists(
          (tx || db.replicaNode())(TableName.PamDiscoveryRun)
            .select(db.raw("1"))
            .whereRaw(`"discoverySourceId" = ${TableName.PamDiscoverySource}."id"`)
            .where("status", PamDiscoveryRunStatus.Running)
        );

      return docs as TPamDiscoverySources[];
    } catch (error) {
      throw new DatabaseError({ error, name: "Find PAM Discovery Sources due for scan" });
    }
  };

  return {
    ...orm,
    findByProjectId,
    findDueForScan
  };
};
