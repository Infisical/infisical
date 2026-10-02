import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TAgentVaultSessionAccessBundleDALFactory = ReturnType<typeof agentVaultSessionAccessBundleDALFactory>;

export const agentVaultSessionAccessBundleDALFactory = (db: TDbClient) =>
  ormify(db, TableName.AgentVaultSessionAccessBundle);
