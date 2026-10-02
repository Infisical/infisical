import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TAgentVaultServiceSubstitutions } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TAgentVaultServiceSubstitutionDALFactory = ReturnType<typeof agentVaultServiceSubstitutionDALFactory>;

export const agentVaultServiceSubstitutionDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.AgentVaultServiceSubstitution);

  const findByServiceIds = async (serviceIds: string[], tx?: Knex): Promise<TAgentVaultServiceSubstitutions[]> => {
    if (!serviceIds.length) return [];
    try {
      return (await (tx || db.replicaNode())(TableName.AgentVaultServiceSubstitution)
        .whereIn("serviceId", serviceIds)
        .orderBy("position", "asc")
        .select(selectAllTableCols(TableName.AgentVaultServiceSubstitution))) as TAgentVaultServiceSubstitutions[];
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault service substitutions" });
    }
  };

  return { ...orm, findByServiceIds };
};
