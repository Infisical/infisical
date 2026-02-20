import { Knex } from "knex";
import { z } from "zod";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

import { DiscoveredAccountSchema } from "./pam-discovery-schemas";

export type TPamDiscoverySourceAccountsDALFactory = ReturnType<typeof pamDiscoverySourceAccountsDALFactory>;

export const pamDiscoverySourceAccountsDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.PamDiscoverySourceAccount);

  const findByDiscoverySourceIdWithAccounts = async (
    discoverySourceId: string,
    { offset = 0, limit = 25, tx }: { offset?: number; limit?: number; tx?: Knex } = {}
  ) => {
    try {
      const dbInstance = tx || db.replicaNode();
      const query = dbInstance(TableName.PamDiscoverySourceAccount)
        .join(TableName.PamAccount, `${TableName.PamDiscoverySourceAccount}.accountId`, `${TableName.PamAccount}.id`)
        .join(TableName.PamResource, `${TableName.PamAccount}.resourceId`, `${TableName.PamResource}.id`)
        .where(`${TableName.PamDiscoverySourceAccount}.discoverySourceId`, discoverySourceId);

      const countQuery = query.clone().count("*", { as: "count" }).first();

      void query.select(
        selectAllTableCols(TableName.PamDiscoverySourceAccount),
        db.ref("name").withSchema(TableName.PamAccount).as("accountName"),
        db.ref("resourceId").withSchema(TableName.PamAccount).as("resourceId"),
        db.ref("resourceType").withSchema(TableName.PamResource).as("resourceType"),
        db.ref("metadata").withSchema(TableName.PamAccount).as("metadata"),
        db.ref("name").withSchema(TableName.PamResource).as("resourceName")
      );

      void query.orderBy(`${TableName.PamAccount}.name`, "asc");

      if (typeof limit === "number") {
        void query.limit(limit).offset(offset);
      }

      const [accounts, countResult] = await Promise.all([query, countQuery]);
      const totalCount = Number(countResult?.count || 0);

      return {
        accounts: accounts as unknown as z.infer<typeof DiscoveredAccountSchema>[],
        totalCount
      };
    } catch (error) {
      throw new DatabaseError({ error, name: "Find discovered accounts by source ID" });
    }
  };

  const upsertJunction = async (
    {
      discoverySourceId,
      accountId,
      lastDiscoveredRunId
    }: {
      discoverySourceId: string;
      accountId: string;
      lastDiscoveredRunId: string;
    },
    tx?: Knex
  ) => {
    try {
      const now = new Date();
      const knex = tx || db;

      await knex(TableName.PamDiscoverySourceAccount)
        .insert({
          discoverySourceId,
          accountId,
          lastDiscoveredAt: now,
          lastDiscoveredRunId,
          isStale: false
        })
        .onConflict(["discoverySourceId", "accountId"])
        .merge({
          lastDiscoveredAt: now,
          lastDiscoveredRunId,
          isStale: false
        });
    } catch (error) {
      throw new DatabaseError({ error, name: "Upsert PAM discovery source account junction" });
    }
  };

  const countByDiscoverySourceIds = async (discoverySourceIds: string[], tx?: Knex) => {
    try {
      const rows = await (tx || db.replicaNode())(TableName.PamDiscoverySourceAccount)
        .whereIn("discoverySourceId", discoverySourceIds)
        .groupBy("discoverySourceId")
        .select("discoverySourceId")
        .count("*", { as: "count" });

      return Object.fromEntries(rows.map((r) => [r.discoverySourceId, Number(r.count)]));
    } catch (error) {
      throw new DatabaseError({ error, name: "Count PAM discovery source accounts by source IDs" });
    }
  };

  const markStaleForRun = async (discoverySourceId: string, runId: string, tx?: Knex) => {
    try {
      const knex = tx || db;

      const result = await knex(TableName.PamDiscoverySourceAccount)
        .where({ discoverySourceId })
        .andWhere((qb) => {
          void qb.whereNull("lastDiscoveredRunId").orWhereNot("lastDiscoveredRunId", runId);
        })
        .andWhere("isStale", false)
        .update({ isStale: true });

      return result;
    } catch (error) {
      throw new DatabaseError({ error, name: "Mark stale PAM discovery source accounts" });
    }
  };

  return {
    ...orm,
    findByDiscoverySourceIdWithAccounts,
    countByDiscoverySourceIds,
    upsertJunction,
    markStaleForRun
  };
};
