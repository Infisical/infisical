import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TPamDiscoverySourceDependenciesDALFactory = ReturnType<typeof pamDiscoverySourceDependenciesDALFactory>;

export const pamDiscoverySourceDependenciesDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.PamDiscoverySourceDependency);

  const countByDiscoverySourceId = async (discoverySourceId: string, tx?: Knex) => {
    try {
      const result = await (tx || db.replicaNode())(TableName.PamDiscoverySourceDependency)
        .where({ discoverySourceId })
        .count("id")
        .first();

      return parseInt(String(result?.count || "0"), 10);
    } catch (error) {
      throw new DatabaseError({ error, name: "Count discovered dependencies by source ID" });
    }
  };

  const upsertJunction = async (
    {
      discoverySourceId,
      dependencyId,
      lastSeenRunId
    }: {
      discoverySourceId: string;
      dependencyId: string;
      lastSeenRunId: string;
    },
    tx?: Knex
  ) => {
    try {
      const now = new Date();
      const knex = tx || db;

      await knex(TableName.PamDiscoverySourceDependency)
        .insert({
          discoverySourceId,
          dependencyId,
          lastSeenAt: now,
          lastSeenRunId,
          isStale: false
        })
        .onConflict(["discoverySourceId", "dependencyId"])
        .merge({
          lastSeenAt: now,
          lastSeenRunId,
          isStale: false
        });
    } catch (error) {
      throw new DatabaseError({ error, name: "Upsert PAM discovery source dependency junction" });
    }
  };

  const markStaleForRun = async (discoverySourceId: string, runId: string, tx?: Knex) => {
    try {
      const knex = tx || db;

      const result = await knex(TableName.PamDiscoverySourceDependency)
        .where({ discoverySourceId })
        .andWhere((qb) => {
          void qb.whereNull("lastSeenRunId").orWhereNot("lastSeenRunId", runId);
        })
        .andWhere("isStale", false)
        .update({ isStale: true });

      return result;
    } catch (error) {
      throw new DatabaseError({ error, name: "Mark stale PAM discovery source dependencies" });
    }
  };

  return {
    ...orm,
    countByDiscoverySourceId,
    upsertJunction,
    markStaleForRun
  };
};
