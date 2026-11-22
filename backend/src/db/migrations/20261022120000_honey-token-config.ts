import { Knex } from "knex";

import { TableName } from "@app/db/schemas";
import { HoneyTokenManagedBy } from "@app/ee/services/honey-token/honey-token-enums";

// Settings that only apply to some honey token types (like where an AWS token's IAM user lives) go in this
// per-token JSON column rather than as root columns. Unrelated to the org-level honey_token_configs table.
export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.HoneyToken, "config")) return;

  await knex.schema.alterTable(TableName.HoneyToken, (t) => {
    t.jsonb("config").nullable();
  });

  // Every token created before this column existed is an AWS token in the customer's own account.
  await knex(TableName.HoneyToken).update({ config: JSON.stringify({ managedBy: HoneyTokenManagedBy.Organization }) });

  await knex.schema.alterTable(TableName.HoneyToken, (t) => {
    t.jsonb("config").notNullable().alter();
  });
}

export async function down(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.HoneyToken, "config"))) return;

  await knex.schema.alterTable(TableName.HoneyToken, (t) => {
    t.dropColumn("config");
  });
}
