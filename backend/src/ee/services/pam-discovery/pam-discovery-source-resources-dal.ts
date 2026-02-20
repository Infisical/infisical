import { Knex } from "knex";
import { z } from "zod";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

import { DiscoveredResourceSchema } from "./pam-discovery-schemas";

export type TPamDiscoverySourceResourcesDALFactory = ReturnType<typeof pamDiscoverySourceResourcesDALFactory>;

export const pamDiscoverySourceResourcesDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.PamDiscoverySourceResource);

  const findByDiscoverySourceIdWithResources = async (
    discoverySourceId: string,
    { offset = 0, limit = 25, tx }: { offset?: number; limit?: number; tx?: Knex } = {}
  ) => {
    try {
      const dbInstance = tx || db.replicaNode();
      const query = dbInstance(TableName.PamDiscoverySourceResource)
        .join(
          TableName.PamResource,
          `${TableName.PamDiscoverySourceResource}.resourceId`,
          `${TableName.PamResource}.id`
        )
        .where(`${TableName.PamDiscoverySourceResource}.discoverySourceId`, discoverySourceId);

      const countQuery = query.clone().count("*", { as: "count" }).first();

      void query.select(
        selectAllTableCols(TableName.PamDiscoverySourceResource),
        db.ref("name").withSchema(TableName.PamResource).as("resourceName"),
        db.ref("resourceType").withSchema(TableName.PamResource).as("resourceType")
      );

      void query.orderBy(`${TableName.PamResource}.name`, "asc");

      if (typeof limit === "number") {
        void query.limit(limit).offset(offset);
      }

      const [resources, countResult] = await Promise.all([query, countQuery]);
      const totalCount = Number(countResult?.count || 0);

      return {
        resources: resources as unknown as z.infer<typeof DiscoveredResourceSchema>[],
        totalCount
      };
    } catch (error) {
      throw new DatabaseError({ error, name: "Find discovered resources by source ID" });
    }
  };

  const upsertJunction = async (
    {
      discoverySourceId,
      resourceId,
      lastDiscoveredRunId
    }: {
      discoverySourceId: string;
      resourceId: string;
      lastDiscoveredRunId: string;
    },
    tx?: Knex
  ) => {
    try {
      const now = new Date();
      const knex = tx || db;

      await knex(TableName.PamDiscoverySourceResource)
        .insert({
          discoverySourceId,
          resourceId,
          lastDiscoveredAt: now,
          lastDiscoveredRunId,
          isStale: false
        })
        .onConflict(["discoverySourceId", "resourceId"])
        .merge({
          lastDiscoveredAt: now,
          lastDiscoveredRunId,
          isStale: false
        });
    } catch (error) {
      throw new DatabaseError({ error, name: "Upsert PAM discovery source resource junction" });
    }
  };

  const countByDiscoverySourceIds = async (discoverySourceIds: string[], tx?: Knex) => {
    try {
      const rows = await (tx || db.replicaNode())(TableName.PamDiscoverySourceResource)
        .whereIn("discoverySourceId", discoverySourceIds)
        .groupBy("discoverySourceId")
        .select("discoverySourceId")
        .count("*", { as: "count" });

      return Object.fromEntries(rows.map((r) => [r.discoverySourceId, Number(r.count)]));
    } catch (error) {
      throw new DatabaseError({ error, name: "Count PAM discovery source resources by source IDs" });
    }
  };

  const markStaleForRun = async (discoverySourceId: string, runId: string, tx?: Knex) => {
    try {
      const knex = tx || db;

      const result = await knex(TableName.PamDiscoverySourceResource)
        .where({ discoverySourceId })
        .andWhere((qb) => {
          void qb.whereNull("lastDiscoveredRunId").orWhereNot("lastDiscoveredRunId", runId);
        })
        .andWhere("isStale", false)
        .update({ isStale: true });

      return result;
    } catch (error) {
      throw new DatabaseError({ error, name: "Mark stale PAM discovery source resources" });
    }
  };

  return {
    ...orm,
    findByDiscoverySourceIdWithResources,
    countByDiscoverySourceIds,
    upsertJunction,
    markStaleForRun
  };
};
