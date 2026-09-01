import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable(TableName.Project);
  if (!hasTable) return;

  const hasColumn = await knex.schema.hasColumn(TableName.Project, "isLegacyAdditionalPrivilegesEnabled");
  if (!hasColumn) {
    await knex.schema.alterTable(TableName.Project, (t) => {
      t.boolean("isLegacyAdditionalPrivilegesEnabled").defaultTo(false).notNullable();
    });

    await knex.raw(`UPDATE ${TableName.Project} SET "isLegacyAdditionalPrivilegesEnabled" = true`);
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable(TableName.Project);
  if (!hasTable) return;

  const hasColumn = await knex.schema.hasColumn(TableName.Project, "isLegacyAdditionalPrivilegesEnabled");
  if (hasColumn) {
    await knex.schema.alterTable(TableName.Project, (t) => {
      t.dropColumn("isLegacyAdditionalPrivilegesEnabled");
    });
  }
}
