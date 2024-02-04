import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.Users, "ghost"))) {
    await knex.schema.alterTable(TableName.Users, (t) => {
      t.boolean("ghost").defaultTo(false).notNullable();
    });
  }

  if (!(await knex.schema.hasColumn(TableName.Project, "e2ee"))) {
    await knex.schema.alterTable(TableName.Project, (t) => {
      t.boolean("e2ee").defaultTo(true).notNullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.Users, "ghost")) {
    await knex.schema.alterTable(TableName.Users, (t) => {
      t.dropColumn("ghost");
    });
  }

  if (await knex.schema.hasColumn(TableName.Project, "e2ee")) {
    await knex.schema.alterTable(TableName.Project, (t) => {
      t.dropColumn("e2ee");
    });
  }
}
