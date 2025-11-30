import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasExternalConfigs = await knex.schema.hasColumn(TableName.PkiCertificateProfile, "externalConfigs");
  if (!hasExternalConfigs) {
    await knex.schema.alterTable(TableName.PkiCertificateProfile, (t) => {
      t.text("externalConfigs").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasExternalConfigs = await knex.schema.hasColumn(TableName.PkiCertificateProfile, "externalConfigs");
  if (hasExternalConfigs) {
    await knex.schema.alterTable(TableName.PkiCertificateProfile, (t) => {
      t.dropColumn("externalConfigs");
    });
  }
}
