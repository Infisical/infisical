import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TProjectRoleDALFactory = ReturnType<typeof projectRoleDALFactory>;

export const projectRoleDALFactory = (db: TDbClient) => ormify(db, TableName.ProjectRoles);
