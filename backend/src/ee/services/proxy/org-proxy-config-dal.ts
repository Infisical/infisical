import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TOrgProxyConfigDALFactory = ReturnType<typeof orgProxyConfigDalFactory>;

export const orgProxyConfigDalFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.OrgProxyConfig);

  return orm;
};
