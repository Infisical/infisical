import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TProjectRoleDalFactory = ReturnType<typeof projectRoleDalFactory>;

export const projectRoleDalFactory = (db: TDbClient) => ormify(db, TableName.ProjectRoles);
