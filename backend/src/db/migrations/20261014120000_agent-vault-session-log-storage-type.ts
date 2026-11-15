import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.AgentVaultSessionLogConfig, "storageType"))) {
    await knex.schema.alterTable(TableName.AgentVaultSessionLogConfig, (t) => {
      t.string("storageType", 16).notNullable().defaultTo("default");
    });

    // Rows recording to a bucket so far point at the customer's own bucket.
    await knex(TableName.AgentVaultSessionLogConfig)
      .where({ enabled: true })
      .whereNotNull("appConnectionId")
      .whereNotNull("bucket")
      .whereNotNull("region")
      .update({ storageType: "external" });

    // Everything else was off: rows without a bucket never recorded, and turning off now forgets the bucket.
    await knex(TableName.AgentVaultSessionLogConfig)
      .whereNot({ storageType: "external" })
      .update({ enabled: false, appConnectionId: null, bucket: null, region: null, keyPrefix: null });
  }
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
