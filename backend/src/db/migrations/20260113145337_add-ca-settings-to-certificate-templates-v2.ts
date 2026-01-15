import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasTemplateCaSettingsColumn = await knex.schema.hasColumn(TableName.PkiCertificatePolicy, "caSettings");
  if (!hasTemplateCaSettingsColumn) {
    await knex.schema.alterTable(TableName.PkiCertificatePolicy, (t) => {
      t.jsonb("caSettings");
    });
  }

  const hasRequestCaSettingsColumn = await knex.schema.hasColumn(TableName.CertificateRequests, "caSettings");
  if (!hasRequestCaSettingsColumn) {
    await knex.schema.alterTable(TableName.CertificateRequests, (t) => {
      t.jsonb("caSettings");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasTemplateCaSettingsColumn = await knex.schema.hasColumn(TableName.PkiCertificatePolicy, "caSettings");
  if (hasTemplateCaSettingsColumn) {
    await knex.schema.alterTable(TableName.PkiCertificatePolicy, (t) => {
      t.dropColumn("caSettings");
    });
  }

  const hasRequestCaSettingsColumn = await knex.schema.hasColumn(TableName.CertificateRequests, "caSettings");
  if (hasRequestCaSettingsColumn) {
    await knex.schema.alterTable(TableName.CertificateRequests, (t) => {
      t.dropColumn("caSettings");
    });
  }
}
