import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TSuperAdminDalFactory = ReturnType<typeof superAdminDalFactory>;

export const superAdminDalFactory = (db: TDbClient) => ormify(db, TableName.SuperAdmin, {});
