import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TInstanceProxyConfigDALFactory = ReturnType<typeof instanceProxyConfigDalFactory>;

export const instanceProxyConfigDalFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.InstanceProxyConfig);

  return orm;
};
