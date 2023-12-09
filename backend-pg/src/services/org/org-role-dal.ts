import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TOrgRoleDalFactory = ReturnType<typeof orgRoleDalFactory>;

export const orgRoleDalFactory = (db: TDbClient) => ormify(db, TableName.OrgRoles);
