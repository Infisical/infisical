import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasSkipBootstrapCertValidationCol = await knex.schema.hasColumn(
    TableName.CertificateTemplateEstConfig,
    "skipBootstrapCertValidation"
  );

  const hasCaChainCol = await knex.schema.hasColumn(TableName.CertificateTemplateEstConfig, "encryptedCaChain");

  await knex.schema.alterTable(TableName.CertificateTemplateEstConfig, (t) => {
    if (!hasSkipBootstrapCertValidationCol) {
      t.boolean("skipBootstrapCertValidation").defaultTo(false).notNullable();
    }

    if (hasCaChainCol) {
      t.binary("encryptedCaChain").nullable().alter();
    }
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasSkipBootstrapCertValidationCol = await knex.schema.hasColumn(
    TableName.CertificateTemplateEstConfig,
    "skipBootstrapCertValidation"
  );

  const hasCaChainCol = await knex.schema.hasColumn(TableName.CertificateTemplateEstConfig, "encryptedCaChain");

  await knex.schema.alterTable(TableName.CertificateTemplateEstConfig, (t) => {
    if (hasSkipBootstrapCertValidationCol) {
      t.dropColumn("skipBootstrapCertValidation");
    }

    if (hasCaChainCol) {
      t.binary("encryptedCaChain").notNullable().alter();
    }
  });
}
