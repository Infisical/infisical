import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.AgentVaultSessionLogConfig, "storageType"))) {
    // Every saved row so far points at the customer's own bucket. The default stays so a pod still on the previous
    // version can insert during a rolling deploy.
    await knex.schema.alterTable(TableName.AgentVaultSessionLogConfig, (t) => {
      t.string("storageType", 16).notNullable().defaultTo("external");
    });
  }

  // Turning session logs off before ever saving a bucket, or detaching the connection, left rows with no bucket.
  // Those were always off, so they become an off default-storage row and the admin's choice survives.
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
