import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TAgentVaultServiceVariableReferences } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TAgentVaultServiceVariableReferenceDALFactory = ReturnType<
  typeof agentVaultServiceVariableReferenceDALFactory
>;

export type TAgentVaultVariableReferenceWithKey = TAgentVaultServiceVariableReferences & { key: string };

export const agentVaultServiceVariableReferenceDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.AgentVaultServiceVariableReference);

  // The key comes from the variable, so a rename shows through without touching these rows.
  const findByServiceIds = async (serviceIds: string[], tx?: Knex): Promise<TAgentVaultVariableReferenceWithKey[]> => {
    if (!serviceIds.length) return [];
    try {
      return (await (tx || db.replicaNode())(TableName.AgentVaultServiceVariableReference)
        .join(
          TableName.AgentVaultVariable,
          `${TableName.AgentVaultServiceVariableReference}.variableId`,
          `${TableName.AgentVaultVariable}.id`
        )
        .whereIn(`${TableName.AgentVaultServiceVariableReference}.serviceId`, serviceIds)
        .orderBy(`${TableName.AgentVaultVariable}.key`, "asc")
        .select(
          selectAllTableCols(TableName.AgentVaultServiceVariableReference),
          db.ref("key").withSchema(TableName.AgentVaultVariable)
        )) as TAgentVaultVariableReferenceWithKey[];
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault variable references" });
    }
  };

  // Reads the primary even without a tx, so a service saved a moment ago shows as using its variables.
  const findByVariableIds = async (
    variableIds: string[],
    tx?: Knex
  ): Promise<TAgentVaultServiceVariableReferences[]> => {
    if (!variableIds.length) return [];
    try {
      return (await (tx || db)(TableName.AgentVaultServiceVariableReference)
        .whereIn("variableId", variableIds)
        .select(
          selectAllTableCols(TableName.AgentVaultServiceVariableReference)
        )) as TAgentVaultServiceVariableReferences[];
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault variable references by variable" });
    }
  };

  return { ...orm, findByServiceIds, findByVariableIds };
};
