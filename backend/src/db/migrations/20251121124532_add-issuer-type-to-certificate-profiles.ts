import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasIssuerTypeColumn = await knex.schema.hasColumn(TableName.PkiCertificateProfile, "issuerType");

  if (!hasIssuerTypeColumn) {
    await knex.schema.alterTable(TableName.PkiCertificateProfile, (t) => {
      t.string("issuerType").notNullable().defaultTo("ca");
    });
  }

  await knex.schema.alterTable(TableName.PkiCertificateProfile, (t) => {
    t.uuid("caId").nullable().alter();
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasIssuerTypeColumn = await knex.schema.hasColumn(TableName.PkiCertificateProfile, "issuerType");

  if (hasIssuerTypeColumn) {
    await knex.schema.alterTable(TableName.PkiCertificateProfile, (t) => {
      t.dropColumn("issuerType");
    });
  }
}
