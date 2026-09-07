import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TAgentVaultConnections } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TAgentVaultConnectionDALFactory = ReturnType<typeof agentVaultConnectionDALFactory>;

export const agentVaultConnectionDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.AgentVaultConnection);

  const findByAccessBundleId = async (accessBundleId: string, tx?: Knex): Promise<TAgentVaultConnections[]> => {
    try {
      return (await (tx || db.replicaNode())(TableName.AgentVaultConnection)
        .where({ accessBundleId })
        .orderBy("name", "asc")) as TAgentVaultConnections[];
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault connections" });
    }
  };

  return { ...orm, findByAccessBundleId };
};
