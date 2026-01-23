import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { ormify, TOrmify } from "@app/lib/knex";

export type TProjectTemplateDALFactory = TOrmify<TableName.ProjectTemplates>;

export const projectTemplateDALFactory = (db: TDbClient): TProjectTemplateDALFactory =>
  ormify(db, TableName.ProjectTemplates);
