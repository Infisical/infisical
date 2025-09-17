import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify, TOrmify } from "@app/lib/knex";

export type TNamespaceDALFactory = TOrmify<TableName.Namespace>;

export const namespaceDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.Namespace);
  return orm;
};
