import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasKind = await knex.schema.hasColumn(TableName.Sandbox, "kind");
  const hasTemplate = await knex.schema.hasColumn(TableName.Sandbox, "template");

  if (hasKind || hasTemplate) {
    await knex.schema.alterTable(TableName.Sandbox, (t) => {
      if (hasKind) t.dropColumn("kind");
      if (hasTemplate) t.dropColumn("template");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasKind = await knex.schema.hasColumn(TableName.Sandbox, "kind");
  const hasTemplate = await knex.schema.hasColumn(TableName.Sandbox, "template");

  if (!hasKind || !hasTemplate) {
    await knex.schema.alterTable(TableName.Sandbox, (t) => {
      if (!hasKind) t.string("kind").notNullable().defaultTo("agent");
      if (!hasTemplate) t.string("template").notNullable().defaultTo("base");
    });
  }
}
