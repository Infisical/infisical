import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TScimDALFactory = ReturnType<typeof scimDALFactory>;

export const scimDALFactory = (db: TDbClient) => {
  const scimTokenOrm = ormify(db, TableName.ScimToken);
  return scimTokenOrm;
};
