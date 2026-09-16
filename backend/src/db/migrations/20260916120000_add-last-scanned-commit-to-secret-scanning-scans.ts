import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasLastScannedCommit = await knex.schema.hasColumn(TableName.SecretScanningScan, "lastScannedCommit");

  if (!hasLastScannedCommit) {
    await knex.schema.alterTable(TableName.SecretScanningScan, (t) => {
      t.string("lastScannedCommit").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasLastScannedCommit = await knex.schema.hasColumn(TableName.SecretScanningScan, "lastScannedCommit");

  if (hasLastScannedCommit) {
    await knex.schema.alterTable(TableName.SecretScanningScan, (t) => {
      t.dropColumn("lastScannedCommit");
    });
  }
}
