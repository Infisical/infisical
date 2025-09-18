import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify, TOrmify } from "@app/lib/knex";

export type TNamespaceRoleDALFactory = TOrmify<TableName.NamespaceRole>;

export const namespaceRoleDALFactory = (db: TDbClient) => ormify(db, TableName.NamespaceRole);
