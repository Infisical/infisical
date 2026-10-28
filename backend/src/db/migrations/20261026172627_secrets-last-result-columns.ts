import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasLastSyncResult = await knex.schema.hasColumn(TableName.SecretSync, "lastSyncResult");
  if (!hasLastSyncResult) {
    await knex.schema.alterTable(TableName.SecretSync, (t) => {
      t.string("lastSyncResult").nullable();
    });

    await knex.raw(`ALTER TABLE ${TableName.SecretSync} DISABLE TRIGGER "${TableName.SecretSync}_updatedAt"`);
    await knex(TableName.SecretSync)
      .where((qb) => {
        void qb
          .whereIn("syncStatus", ["succeeded", "failed"])
          .orWhereNotNull("lastSyncMessage")
          .orWhereNotNull("lastSyncedAt");
      })
      .update({
        // @ts-expect-error lastSyncResult is typed as a string; a raw CASE expression is expected here
        lastSyncResult: knex.raw(`
          CASE
            WHEN "syncStatus" = 'succeeded' THEN 'succeeded'
            WHEN "syncStatus" = 'failed' THEN 'failed'
            WHEN "lastSyncMessage" IS NOT NULL THEN 'failed'
            ELSE 'succeeded'
          END
        `)
      });
    await knex.raw(`ALTER TABLE ${TableName.SecretSync} ENABLE TRIGGER "${TableName.SecretSync}_updatedAt"`);
  }

  if (!(await knex.schema.hasColumn(TableName.DynamicSecret, "revocationFailing"))) {
    await knex.schema.alterTable(TableName.DynamicSecret, (t) => {
      t.boolean("revocationFailing").notNullable().defaultTo(false);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.SecretSync, "lastSyncResult")) {
    await knex.schema.alterTable(TableName.SecretSync, (t) => {
      t.dropColumn("lastSyncResult");
    });
  }

  if (await knex.schema.hasColumn(TableName.DynamicSecret, "revocationFailing")) {
    await knex.schema.alterTable(TableName.DynamicSecret, (t) => {
      t.dropColumn("revocationFailing");
    });
  }
}
