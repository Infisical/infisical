import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TAgentVaultVariables } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TAgentVaultVariableDALFactory = ReturnType<typeof agentVaultVariableDALFactory>;

export type TAgentVaultVariableValueRow = Pick<TAgentVaultVariables, "id" | "accessBundleId" | "encryptedValue">;

export const agentVaultVariableDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.AgentVaultVariable);

  // Reads the primary even without a tx, so a variable created a moment ago is always listed.
  const findByAccessBundleId = async (accessBundleId: string, tx?: Knex): Promise<TAgentVaultVariables[]> => {
    try {
      return (await (tx || db)(TableName.AgentVaultVariable)
        .where({ accessBundleId })
        .orderBy("key", "asc")
        .select(selectAllTableCols(TableName.AgentVaultVariable))) as TAgentVaultVariables[];
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault variables" });
    }
  };

  // Reads the primary even without a tx, so a key created a moment ago is always found.
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

  // Resolve is the hot path, so it reads a replica. A variable is always saved before any service that uses it,
  // but each query picks its own replica, and the one serving this read can trail the one that served the
  // service. So an id the replica does not have is asked of the primary before resolve gives up on it.
  const findValuesForResolve = async ({
    variableIds,
    accessBundleIds
  }: {
    variableIds: string[];
    accessBundleIds: string[];
  }): Promise<TAgentVaultVariableValueRow[]> => {
    if (!variableIds.length || !accessBundleIds.length) return [];
    const read = async (conn: Knex, ids: string[]): Promise<TAgentVaultVariableValueRow[]> =>
      conn(TableName.AgentVaultVariable)
        .whereIn("id", ids)
        .whereIn("accessBundleId", accessBundleIds)
        .select("id", "accessBundleId", "encryptedValue");
    try {
      const rows = await read(db.replicaNode(), variableIds);
      const found = new Set(rows.map((row) => row.id));
      const missing = variableIds.filter((id) => !found.has(id));
      return missing.length ? [...rows, ...(await read(db, missing))] : rows;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault variable values" });
    }
  };

  return { ...orm, findByAccessBundleId, findKeysByAccessBundleId, findValuesForResolve };
};
