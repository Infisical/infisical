import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TAgentVaultServiceCustomHeaders } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TAgentVaultServiceCustomHeaderDALFactory = ReturnType<typeof agentVaultServiceCustomHeaderDALFactory>;

export const agentVaultServiceCustomHeaderDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.AgentVaultServiceCustomHeader);

  const findByServiceIds = async (serviceIds: string[], tx?: Knex): Promise<TAgentVaultServiceCustomHeaders[]> => {
    if (!serviceIds.length) return [];
    try {
      return (await (tx || db.replicaNode())(TableName.AgentVaultServiceCustomHeader)
        .whereIn("serviceId", serviceIds)
        .orderBy("position", "asc")
        .select(selectAllTableCols(TableName.AgentVaultServiceCustomHeader))) as TAgentVaultServiceCustomHeaders[];
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault service headers" });
    }
  };

  return { ...orm, findByServiceIds };
};
