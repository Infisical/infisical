import { Knex } from "knex";

import { ProjectVersion, TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasGhostUserColumn = await knex.schema.hasColumn(TableName.Users, "ghost");
  const hasProjectVersionColumn = await knex.schema.hasColumn(TableName.Project, "version");

  if (!hasGhostUserColumn) {
    await knex.schema.alterTable(TableName.Users, (t) => {
      t.boolean("ghost").defaultTo(false).notNullable();
    });
  }

  if (!hasProjectVersionColumn) {
    await knex.schema.alterTable(TableName.Project, (t) => {
      t.string("version").defaultTo(ProjectVersion.V1).notNullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasGhostUserColumn = await knex.schema.hasColumn(TableName.Users, "ghost");
  const hasProjectVersionColumn = await knex.schema.hasColumn(TableName.Project, "version");

  if (hasGhostUserColumn) {
    await knex.schema.alterTable(TableName.Users, (t) => {
      t.dropColumn("ghost");
    });
  }

  if (hasProjectVersionColumn) {
    await knex.schema.alterTable(TableName.Project, (t) => {
      t.dropColumn("version");
    });
  }
}
