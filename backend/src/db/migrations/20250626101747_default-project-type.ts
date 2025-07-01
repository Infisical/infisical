import { Knex } from "knex";

import { ProjectType, TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasTypeColumn = await knex.schema.hasColumn(TableName.Project, "type");
  const hasDefaultTypeColumn = await knex.schema.hasColumn(TableName.Project, "defaultProduct");
  if (hasTypeColumn && !hasDefaultTypeColumn) {
    await knex.schema.alterTable(TableName.Project, (t) => {
      t.string("type").nullable().alter();
      t.string("defaultProduct").notNullable().defaultTo(ProjectType.SecretManager);
    });

    await knex(TableName.Project).update({
      // eslint-disable-next-line
      // @ts-ignore this is because this field is created later
      defaultProduct: knex.raw(`
    CASE 
      WHEN "type" IS NULL OR "type" = '' THEN 'secret-manager' 
      ELSE "type" 
    END
  `)
    });
  }

  const hasTemplateTypeColumn = await knex.schema.hasColumn(TableName.ProjectTemplates, "type");
  if (hasTemplateTypeColumn) {
    await knex.schema.alterTable(TableName.ProjectTemplates, (t) => {
      t.string("type").nullable().alter();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasDefaultTypeColumn = await knex.schema.hasColumn(TableName.Project, "defaultProduct");
  if (hasDefaultTypeColumn) {
    await knex.schema.alterTable(TableName.Project, (t) => {
      t.dropColumn("defaultProduct");
    });
  }
}
