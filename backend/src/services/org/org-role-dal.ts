import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TOrgRoleDALFactory = ReturnType<typeof orgRoleDALFactory>;

export const orgRoleDALFactory = (db: TDbClient) => ormify(db, TableName.OrgRoles);
