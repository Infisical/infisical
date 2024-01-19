import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TServiceTokenDALFactory = ReturnType<typeof serviceTokenDALFactory>;

export const serviceTokenDALFactory = (db: TDbClient) => {
  const stOrm = ormify(db, TableName.ServiceToken);
  return stOrm;
};
