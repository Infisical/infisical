import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TKmipInstanceConfigDALFactory = ReturnType<typeof kmipInstanceConfigDALFactory>;

export const kmipInstanceConfigDALFactory = (db: TDbClient) => {
  const kmipInstanceConfigOrm = ormify(db, TableName.KmipInstanceConfig);

  return {
    ...kmipInstanceConfigOrm
  };
};
