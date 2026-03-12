import { Knex } from "knex";

import { TableName } from "@app/db/schemas";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.ObservabilityWidget)) {
    const hasIcon = await knex.schema.hasColumn(TableName.ObservabilityWidget, "icon");
    const hasColor = await knex.schema.hasColumn(TableName.ObservabilityWidget, "color");

    if (!hasIcon || !hasColor) {
      await knex.schema.alterTable(TableName.ObservabilityWidget, (t) => {
        if (!hasIcon) {
          t.string("icon", 64);
        }
        if (!hasColor) {
          t.string("color", 32);
        }
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.ObservabilityWidget)) {
    const hasIcon = await knex.schema.hasColumn(TableName.ObservabilityWidget, "icon");
    const hasColor = await knex.schema.hasColumn(TableName.ObservabilityWidget, "color");

    await knex.schema.alterTable(TableName.ObservabilityWidget, (t) => {
      if (hasIcon) {
        t.dropColumn("icon");
      }
      if (hasColor) {
        t.dropColumn("color");
      }
    });
  }
}
