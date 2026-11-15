import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasTrigger = await knex.schema.hasColumn(TableName.SecretScanningScan, "trigger");
  const hasMetadata = await knex.schema.hasColumn(TableName.SecretScanningScan, "metadata");

  if (!hasTrigger || !hasMetadata) {
    await knex.schema.alterTable(TableName.SecretScanningScan, (t) => {
      if (!hasTrigger) t.string("trigger").nullable();
      if (!hasMetadata) t.jsonb("metadata").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasTrigger = await knex.schema.hasColumn(TableName.SecretScanningScan, "trigger");
  const hasMetadata = await knex.schema.hasColumn(TableName.SecretScanningScan, "metadata");

  if (hasTrigger || hasMetadata) {
    await knex.schema.alterTable(TableName.SecretScanningScan, (t) => {
      if (hasTrigger) t.dropColumn("trigger");
      if (hasMetadata) t.dropColumn("metadata");
    });
  }
}
