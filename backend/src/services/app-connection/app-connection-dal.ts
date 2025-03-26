import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TAppConnectionDALFactory = ReturnType<typeof appConnectionDALFactory>;

export const appConnectionDALFactory = (db: TDbClient) => {
  const appConnectionOrm = ormify(db, TableName.AppConnection);

  return { ...appConnectionOrm };
};
