import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TDynamicSecretLeases } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { selectAllTableCols } from "@app/lib/knex";

import { DynamicSecretStatus } from "../dynamic-secret/dynamic-secret-types";

export type TAgentVaultDynamicSecretDALFactory = ReturnType<typeof agentVaultDynamicSecretDALFactory>;

export const agentVaultDynamicSecretDALFactory = (db: TDbClient) => {
  // From the primary: resolve looks for a lease another pod just created under the same lock.
  const findLeasesForService = async (
    { serviceId, dynamicSecretId }: { serviceId: string; dynamicSecretId: string },
    tx?: Knex
  ): Promise<TDynamicSecretLeases[]> => {
    try {
      return (await (tx || db)(TableName.DynamicSecretLease)
        .where(`${TableName.DynamicSecretLease}.dynamicSecretId`, dynamicSecretId)
        .whereRaw(`??->>'agentVaultServiceId' = ?`, [`${TableName.DynamicSecretLease}.config`, serviceId])
        .select(selectAllTableCols(TableName.DynamicSecretLease))) as TDynamicSecretLeases[];
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault dynamic secret leases" });
    }
  };

  const findExistingDynamicSecretIds = async (ids: string[], tx?: Knex): Promise<Set<string>> => {
    if (!ids.length) return new Set();
    try {
      const rows = (await (tx || db.replicaNode())(TableName.DynamicSecret)
        .whereIn("id", ids)
        .where((qb) => {
          void qb.whereNull("status").orWhereNot("status", DynamicSecretStatus.Deleting);
        })
        .select("id")) as { id: string }[];
      return new Set(rows.map((row) => row.id));
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault dynamic secrets" });
    }
  };

  return { findLeasesForService, findExistingDynamicSecretIds };
};
