import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TIdentitySpiffeAuthDALFactory = ReturnType<typeof identitySpiffeAuthDALFactory>;

export const identitySpiffeAuthDALFactory = (db: TDbClient) => {
  const spiffeAuthOrm = ormify(db, TableName.IdentitySpiffeAuth);

  return { ...spiffeAuthOrm };
};
