import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TProxyDALFactory = ReturnType<typeof proxyDalFactory>;

export const proxyDalFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.Proxy);

  return orm;
};
