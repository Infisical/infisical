import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.NhiSource)) {
    const hasConfig = await knex.schema.hasColumn(TableName.NhiSource, "config");
    if (!hasConfig) {
      await knex.schema.alterTable(TableName.NhiSource, (t) => {
        t.jsonb("config").nullable();
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.NhiSource)) {
    const hasConfig = await knex.schema.hasColumn(TableName.NhiSource, "config");
    if (hasConfig) {
      await knex.schema.alterTable(TableName.NhiSource, (t) => {
        t.dropColumn("config");
      });
    }
  }
}
