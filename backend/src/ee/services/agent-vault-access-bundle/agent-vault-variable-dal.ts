import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TAgentVaultVariables } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TAgentVaultVariableDALFactory = ReturnType<typeof agentVaultVariableDALFactory>;

export type TAgentVaultVariableValueRow = Pick<TAgentVaultVariables, "id" | "accessBundleId" | "encryptedValue">;

export const agentVaultVariableDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.AgentVaultVariable);

  const findByAccessBundleId = async (accessBundleId: string, tx?: Knex): Promise<TAgentVaultVariables[]> => {
    try {
      return (await (tx || db.replicaNode())(TableName.AgentVaultVariable)
        .where({ accessBundleId })
        .orderBy("key", "asc")
        .select(selectAllTableCols(TableName.AgentVaultVariable))) as TAgentVaultVariables[];
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault variables" });
    }
  };

  // Reads the primary even without a tx. A service write maps keys to ids before it seals, outside its
  // transaction, and a variable created a moment earlier may not have reached a replica yet.
  const findKeysByAccessBundleId = async (
    accessBundleId: string,
    tx?: Knex
  ): Promise<Pick<TAgentVaultVariables, "id" | "key">[]> => {
    try {
      return await (tx || db)(TableName.AgentVaultVariable).where({ accessBundleId }).select("id", "key");
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault variable keys" });
    }
  };

  const findValuesForResolve = async ({
    variableIds,
    accessBundleIds
  }: {
    variableIds: string[];
    accessBundleIds: string[];
  }): Promise<TAgentVaultVariableValueRow[]> => {
    if (!variableIds.length || !accessBundleIds.length) return [];
    try {
      return await db
        .replicaNode()(TableName.AgentVaultVariable)
        .whereIn("id", variableIds)
        .whereIn("accessBundleId", accessBundleIds)
        .select("id", "accessBundleId", "encryptedValue");
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault variable values" });
    }
  };

  return { ...orm, findByAccessBundleId, findKeysByAccessBundleId, findValuesForResolve };
};
