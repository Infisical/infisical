import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TResourceTokenAuthDALFactory = ReturnType<typeof resourceTokenAuthDALFactory>;

export const resourceTokenAuthDALFactory = (db: TDbClient) => {
  return ormify(db, TableName.ResourceTokenAuth);
};
