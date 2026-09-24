import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.Organization)) {
    const hasColumn = await knex.schema.hasColumn(TableName.Organization, "orgWideSecretValueTrackingEnabled");
    if (!hasColumn) {
      await knex.schema.alterTable(TableName.Organization, (t) => {
        t.boolean("orgWideSecretValueTrackingEnabled").defaultTo(true).notNullable();
      });

      // Organizations that already exist hold secrets written before the org-scoped digest, so they
      // are incomplete until their backfill runs. Only organizations created from here on carry it
      // on every secret they ever write.
      //
      // Raw rather than a typed update: the generated schema is regenerated from the database this
      // migration has not yet been applied to, so a typed update cannot compile when it first runs.
      await knex.raw(`UPDATE ?? SET "orgWideSecretValueTrackingEnabled" = false`, [TableName.Organization]);
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.Organization)) {
    const hasColumn = await knex.schema.hasColumn(TableName.Organization, "orgWideSecretValueTrackingEnabled");
    if (hasColumn) {
      await knex.schema.alterTable(TableName.Organization, (t) => {
        t.dropColumn("orgWideSecretValueTrackingEnabled");
      });
    }
  }
}
