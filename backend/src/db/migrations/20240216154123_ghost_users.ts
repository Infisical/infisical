import { Knex } from "knex";

import { ProjectVersion, TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasGhostUserColumn = await knex.schema.hasColumn(TableName.Users, "isGhost");
  const hasProjectVersionColumn = await knex.schema.hasColumn(TableName.Project, "version");

  if (!hasGhostUserColumn) {
    await knex.schema.alterTable(TableName.Users, (t) => {
      t.boolean("isGhost").defaultTo(false).notNullable();
    });
  }

  if (!hasProjectVersionColumn) {
    await knex.schema.alterTable(TableName.Project, (t) => {
      t.integer("version").defaultTo(ProjectVersion.V1).notNullable();
      t.string("upgradeStatus").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasGhostUserColumn = await knex.schema.hasColumn(TableName.Users, "isGhost");
  const hasProjectVersionColumn = await knex.schema.hasColumn(TableName.Project, "version");

  if (hasGhostUserColumn) {
    await knex.schema.alterTable(TableName.Users, (t) => {
      t.dropColumn("isGhost");
    });
  }

  if (hasProjectVersionColumn) {
    await knex.schema.alterTable(TableName.Project, (t) => {
      t.dropColumn("version");
      t.dropColumn("upgradeStatus");
    });
  }
}
