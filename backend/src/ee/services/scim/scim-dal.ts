import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify, TOrmify } from "@app/lib/knex";

export type TScimDALFactory = TOrmify<TableName.ScimToken>;

export const scimDALFactory = (db: TDbClient): TScimDALFactory => {
  const scimTokenOrm = ormify(db, TableName.ScimToken);
  return scimTokenOrm;
};
