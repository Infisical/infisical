import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.AgentVaultSessionLogConfig, "storageType"))) {
    await knex.schema.alterTable(TableName.AgentVaultSessionLogConfig, (t) => {
      t.string("storageType", 16).notNullable().defaultTo("default");
    });
  }

  // Every row with a bucket so far points at the customer's own bucket.
  await knex(TableName.AgentVaultSessionLogConfig)
    .whereNotNull("appConnectionId")
    .whereNotNull("bucket")
    .whereNotNull("region")
    .update({ storageType: "external" });

  // Turning session logs off before ever saving a bucket, or detaching the connection, left rows with no bucket.
  // Those were always off, so they become an off default-storage row and stay off, rather than reading as on in
  // default storage.
  await knex(TableName.AgentVaultSessionLogConfig)
    .where((qb) => {
      void qb.whereNull("appConnectionId").orWhereNull("bucket").orWhereNull("region");
    })
    .update({
      storageType: "default",
      enabled: false,
      appConnectionId: null,
      bucket: null,
      region: null,
      keyPrefix: null
    });
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.AgentVaultSessionLogConfig, "storageType")) {
    // The analytics view selects this column, and Postgres won't drop a column a view uses. The next regeneration
    // recreates the view without it.
    await knex.raw(`DROP VIEW IF EXISTS analytics.??`, [TableName.AgentVaultSessionLogConfig]);
    await knex.schema.alterTable(TableName.AgentVaultSessionLogConfig, (t) => {
      t.dropColumn("storageType");
    });
  }
}
