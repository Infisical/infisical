import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.Organization)) {
    const hasColumn = await knex.schema.hasColumn(TableName.Organization, "orgWideSecretValueTrackingEnabled");
    if (!hasColumn) {
      await knex.schema.alterTable(TableName.Organization, (t) => {
        t.boolean("orgWideSecretValueTrackingEnabled").defaultTo(false).notNullable();
      });

      // The column defaults to false rather than true, and org creation opts a new org in
      // explicitly. During a rolling deploy the old replicas keep serving after this migration runs,
      // and every secret they write carries no org digest, so an org they create is not complete
      // however new it is. A database default cannot tell the two apart; the application code can.
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
