import { Knex } from "knex";

import { ProjectType, TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.ProjectTemplates, "type"))) {
    await knex.schema.alterTable(TableName.ProjectTemplates, (t) => {
      // defaulting to sm for migration to set existing, new ones will always be specified on creation
      t.string("type").defaultTo(ProjectType.SecretManager).notNullable();
      t.jsonb("environments").nullable().alter();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.ProjectTemplates, "type")) {
    await knex.schema.alterTable(TableName.ProjectTemplates, (t) => {
      t.dropColumn("type");
      // not reverting nullable environments
    });
  }
}
