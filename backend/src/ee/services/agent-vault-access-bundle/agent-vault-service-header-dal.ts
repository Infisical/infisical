import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TAgentVaultServiceHeaders } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TAgentVaultServiceHeaderDALFactory = ReturnType<typeof agentVaultServiceHeaderDALFactory>;

export const agentVaultServiceHeaderDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.AgentVaultServiceHeader);

  const findByServiceIds = async (serviceIds: string[], tx?: Knex): Promise<TAgentVaultServiceHeaders[]> => {
    if (!serviceIds.length) return [];
    try {
      return (await (tx || db.replicaNode())(TableName.AgentVaultServiceHeader)
        .whereIn("serviceId", serviceIds)
        .orderBy("position", "asc")
        .select(selectAllTableCols(TableName.AgentVaultServiceHeader))) as TAgentVaultServiceHeaders[];
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault service headers" });
    }
  };

  return { ...orm, findByServiceIds };
};
