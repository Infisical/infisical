import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasIsRedactedColumn = await knex.schema.hasColumn(TableName.SecretVersionV2, "isRedacted");
  const hasRedactedAtColumn = await knex.schema.hasColumn(TableName.SecretVersionV2, "redactedAt");
  const hasRedactedByUserColumn = await knex.schema.hasColumn(TableName.SecretVersionV2, "redactedByUserId");
  const hasParentVersionIdColumn = await knex.schema.hasColumn(TableName.SecretVersionV2, "parentVersionId");

  const missingColumns =
    !hasIsRedactedColumn || !hasRedactedAtColumn || !hasRedactedByUserColumn || !hasParentVersionIdColumn;

  if (missingColumns) {
    await knex.schema.alterTable(TableName.SecretVersionV2, (table) => {
      if (!hasParentVersionIdColumn)
        table.uuid("parentVersionId").references("id").inTable(TableName.SecretVersionV2).onDelete("SET NULL");

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
  const hasParentVersionIdColumn = await knex.schema.hasColumn(TableName.SecretVersionV2, "parentVersionId");
  const hasColumns = hasIsRedactedColumn || hasRedactedAtColumn || hasRedactedByUserColumn || hasParentVersionIdColumn;

  if (hasColumns) {
    await knex.schema.alterTable(TableName.SecretVersionV2, (table) => {
      if (hasIsRedactedColumn) table.dropColumn("isRedacted");
      if (hasRedactedAtColumn) table.dropColumn("redactedAt");
      if (hasRedactedByUserColumn) table.dropColumn("redactedByUserId");
      if (hasParentVersionIdColumn) table.dropColumn("parentVersionId");
    });
  }
}
