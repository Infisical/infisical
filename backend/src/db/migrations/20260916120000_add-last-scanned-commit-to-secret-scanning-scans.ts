import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasLastScannedCommit = await knex.schema.hasColumn(TableName.SecretScanningScan, "lastScannedCommit");
  const hasProgressUpdatedAt = await knex.schema.hasColumn(TableName.SecretScanningScan, "progressUpdatedAt");

  if (!hasLastScannedCommit || !hasProgressUpdatedAt) {
    await knex.schema.alterTable(TableName.SecretScanningScan, (t) => {
      if (!hasLastScannedCommit) t.string("lastScannedCommit").nullable();
      if (!hasProgressUpdatedAt) t.timestamp("progressUpdatedAt").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasLastScannedCommit = await knex.schema.hasColumn(TableName.SecretScanningScan, "lastScannedCommit");
  const hasProgressUpdatedAt = await knex.schema.hasColumn(TableName.SecretScanningScan, "progressUpdatedAt");

  if (hasLastScannedCommit || hasProgressUpdatedAt) {
    await knex.schema.alterTable(TableName.SecretScanningScan, (t) => {
      if (hasLastScannedCommit) t.dropColumn("lastScannedCommit");
      if (hasProgressUpdatedAt) t.dropColumn("progressUpdatedAt");
    });
  }
}
