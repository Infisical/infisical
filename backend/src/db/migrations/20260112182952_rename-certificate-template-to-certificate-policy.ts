import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.PkiCertificateTemplateV2)) {
    await knex.schema.renameTable(TableName.PkiCertificateTemplateV2, TableName.PkiCertificatePolicy);
  }

  if (await knex.schema.hasColumn(TableName.PkiCertificateProfile, "certificateTemplateId")) {
    await knex.schema.alterTable(TableName.PkiCertificateProfile, (t) => {
      t.renameColumn("certificateTemplateId", "certificatePolicyId");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.PkiCertificatePolicy)) {
    await knex.schema.renameTable(TableName.PkiCertificatePolicy, TableName.PkiCertificateTemplateV2);
  }

  if (await knex.schema.hasColumn(TableName.PkiCertificateProfile, "certificatePolicyId")) {
    await knex.schema.alterTable(TableName.PkiCertificateProfile, (t) => {
      t.renameColumn("certificatePolicyId", "certificateTemplateId");
    });
  }
}
