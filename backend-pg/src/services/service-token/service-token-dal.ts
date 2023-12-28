import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TServiceTokenDalFactory = ReturnType<typeof serviceTokenDalFactory>;

export const serviceTokenDalFactory = (db: TDbClient) => {
  const stOrm = ormify(db, TableName.ServiceToken);
  return stOrm;
};
