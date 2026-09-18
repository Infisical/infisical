import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TKmipServerDALFactory = ReturnType<typeof kmipServerDALFactory>;

export const kmipServerDALFactory = (db: TDbClient) => {
  return ormify(db, TableName.KmipServer);
};
