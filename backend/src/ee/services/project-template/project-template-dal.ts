import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TProjectTemplateDALFactory = ReturnType<typeof projectTemplateDALFactory>;

export const projectTemplateDALFactory = (db: TDbClient) => ormify(db, TableName.ProjectTemplates);
