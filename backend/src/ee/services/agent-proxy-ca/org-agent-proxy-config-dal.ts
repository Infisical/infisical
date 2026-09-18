import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TOrgAgentProxyConfigDALFactory = ReturnType<typeof orgAgentProxyConfigDALFactory>;

export const orgAgentProxyConfigDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.OrgAgentProxyConfig);
  return orm;
};
