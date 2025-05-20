import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasLifetimeColumn = await knex.schema.hasColumn(TableName.Organization, "maxSharedSecretLifetime");
  const hasViewLimitColumn = await knex.schema.hasColumn(TableName.Organization, "maxSharedSecretViewLimit");

  if (!hasLifetimeColumn || !hasViewLimitColumn) {
    await knex.schema.alterTable(TableName.Organization, (t) => {
      if (!hasLifetimeColumn) {
        t.integer("maxSharedSecretLifetime").nullable().defaultTo(2592000); // 30 days in seconds
      }
      if (!hasViewLimitColumn) {
        t.integer("maxSharedSecretViewLimit").nullable();
      }
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasLifetimeColumn = await knex.schema.hasColumn(TableName.Organization, "maxSharedSecretLifetime");
  const hasViewLimitColumn = await knex.schema.hasColumn(TableName.Organization, "maxSharedSecretViewLimit");

  if (hasLifetimeColumn || hasViewLimitColumn) {
    await knex.schema.alterTable(TableName.Organization, (t) => {
      if (hasLifetimeColumn) {
        t.dropColumn("maxSharedSecretLifetime");
      }
      if (hasViewLimitColumn) {
        t.dropColumn("maxSharedSecretViewLimit");
      }
    });
  }
}
