import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable(TableName.Environment);
  if (!hasTable) return;

  const hasExpireAfter = await knex.schema.hasColumn(TableName.Environment, "expireAfter");
  const hasRequestedSoftDeleteAt = await knex.schema.hasColumn(TableName.Environment, "requestedSoftDeleteAt");

  if (!hasExpireAfter || !hasRequestedSoftDeleteAt) {
    await knex.schema.alterTable(TableName.Environment, (t) => {
      if (!hasExpireAfter) t.timestamp("expireAfter", { useTz: true }).nullable();
      if (!hasRequestedSoftDeleteAt) t.timestamp("requestedSoftDeleteAt", { useTz: true }).nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable(TableName.Environment);
  if (!hasTable) return;

  const hasExpireAfter = await knex.schema.hasColumn(TableName.Environment, "expireAfter");
  const hasRequestedSoftDeleteAt = await knex.schema.hasColumn(TableName.Environment, "requestedSoftDeleteAt");

  if (hasExpireAfter || hasRequestedSoftDeleteAt) {
    await knex.schema.alterTable(TableName.Environment, (t) => {
      if (hasExpireAfter) t.dropColumn("expireAfter");
      if (hasRequestedSoftDeleteAt) t.dropColumn("requestedSoftDeleteAt");
    });
  }
}
