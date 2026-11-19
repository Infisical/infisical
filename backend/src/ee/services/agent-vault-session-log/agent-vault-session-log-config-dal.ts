import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TAgentVaultSessionLogConfigs } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TAgentVaultSessionLogConfigDALFactory = ReturnType<typeof agentVaultSessionLogConfigDALFactory>;

export const agentVaultSessionLogConfigDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.AgentVaultSessionLogConfig);

  // Reads the primary: a replica still saying "off" just after session logs are turned back on would make every proxy
  // drop what it holds.
  const findByProjectIdFromPrimary = async (
    projectId: string,
    tx?: Knex
  ): Promise<TAgentVaultSessionLogConfigs | undefined> => {
    try {
      return await (tx || db)(TableName.AgentVaultSessionLogConfig).where({ projectId }).first();
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault session log config from primary" });
    }
  };

  return { ...orm, findByProjectIdFromPrimary };
};
