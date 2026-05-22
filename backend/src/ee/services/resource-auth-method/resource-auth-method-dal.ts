import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TResourceAuthMethodDALFactory = ReturnType<typeof resourceAuthMethodDALFactory>;

export const resourceAuthMethodDALFactory = (db: TDbClient) => {
  return ormify(db, TableName.ResourceAuthMethod);
};
