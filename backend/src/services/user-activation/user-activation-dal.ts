import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TUserActivationDALFactory = ReturnType<typeof userActivationDALFactory>;

export const userActivationDALFactory = (db: TDbClient) => {
  const userActivationOrm = ormify(db, TableName.UserSecretActivation);

  return userActivationOrm;
};
