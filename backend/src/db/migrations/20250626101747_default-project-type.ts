import { Knex } from "knex";
import { TableName, ProjectType } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasTypeColumn = await knex.schema.hasColumn(TableName.Project, "type");
  const hasDefaultTypeColumn = await knex.schema.hasColumn(TableName.Project, "defaultType");
  if (hasTypeColumn && !hasDefaultTypeColumn) {
    await knex.schema.alterTable(TableName.Project, (t) => {
      t.string("type").nullable().alter();
      t.string("defaultType").notNullable().defaultTo(ProjectType.SecretManager);
    });

    await knex(TableName.Project).update({
      // eslint-disable-next-line
      // @ts-ignore this is because this field is created later
      defaultType: knex.raw("type")
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasDefaultTypeColumn = await knex.schema.hasColumn(TableName.Project, "defaultType");
  if (hasDefaultTypeColumn) {
    await knex.schema.alterTable(TableName.Project, (t) => {
      t.dropColumn("defaultType");
    });
  }
}
