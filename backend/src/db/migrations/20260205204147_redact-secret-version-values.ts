import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasIsRedactedColumn = await knex.schema.hasColumn(TableName.SecretVersionV2, "isRedacted");
  const hasRedactedAtColumn = await knex.schema.hasColumn(TableName.SecretVersionV2, "redactedAt");
  const hasRedactedByUserColumn = await knex.schema.hasColumn(TableName.SecretVersionV2, "redactedByUserId");

  const missingColumns = !hasIsRedactedColumn || !hasRedactedAtColumn || !hasRedactedByUserColumn;

  if (missingColumns) {
    await knex.schema.alterTable(TableName.SecretVersionV2, (table) => {
      if (!hasIsRedactedColumn) table.boolean("isRedacted").defaultTo(false).notNullable();
      if (!hasRedactedAtColumn) table.timestamp("redactedAt").nullable();
      if (!hasRedactedByUserColumn)
        table.uuid("redactedByUserId").references("id").inTable(TableName.Users).onDelete("SET NULL");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasIsRedactedColumn = await knex.schema.hasColumn(TableName.SecretVersionV2, "isRedacted");
  const hasRedactedAtColumn = await knex.schema.hasColumn(TableName.SecretVersionV2, "redactedAt");
  const hasRedactedByUserColumn = await knex.schema.hasColumn(TableName.SecretVersionV2, "redactedByUserId");

  const hasColumns = hasIsRedactedColumn || hasRedactedAtColumn || hasRedactedByUserColumn;

  if (hasColumns) {
    await knex.schema.alterTable(TableName.SecretVersionV2, (table) => {
      if (hasIsRedactedColumn) table.dropColumn("isRedacted");
      if (hasRedactedAtColumn) table.dropColumn("redactedAt");
      if (hasRedactedByUserColumn) table.dropColumn("redactedByUserId");
    });
  }
}
