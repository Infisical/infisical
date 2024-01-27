import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TSuperAdminDALFactory = ReturnType<typeof superAdminDALFactory>;

export const superAdminDALFactory = (db: TDbClient) => ormify(db, TableName.SuperAdmin, {});
