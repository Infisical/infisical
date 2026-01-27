import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.CertificateSync, "syncMetadata");
  if (!hasColumn) {
    await knex.schema.alterTable(TableName.CertificateSync, (t) => {
      t.jsonb("syncMetadata").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.CertificateSync, "syncMetadata");
  if (hasColumn) {
    await knex.schema.alterTable(TableName.CertificateSync, (t) => {
      t.dropColumn("syncMetadata");
    });
  }
}
