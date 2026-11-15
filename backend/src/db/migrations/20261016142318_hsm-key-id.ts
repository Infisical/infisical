import { Knex } from "knex";

import { TableName } from "@app/db/schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.Certificate, "hsmKeyId"))) {
    await knex.schema.alterTable(TableName.Certificate, (t) => {
      t.string("hsmKeyId", 256).nullable();
    });
  }

  if (!(await knex.schema.hasColumn(TableName.CertificateAuthoritySecret, "hsmKeyId"))) {
    await knex.schema.alterTable(TableName.CertificateAuthoritySecret, (t) => {
      t.string("hsmKeyId", 256).nullable();
    });
  }

  if (!(await knex.schema.hasColumn(TableName.PkiSignerCertificateIssuanceJobs, "hsmKeyId"))) {
    await knex.schema.alterTable(TableName.PkiSignerCertificateIssuanceJobs, (t) => {
      t.string("hsmKeyId", 256).nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.Certificate, "hsmKeyId")) {
    await knex.schema.alterTable(TableName.Certificate, (t) => {
      t.dropColumn("hsmKeyId");
    });
  }

  if (await knex.schema.hasColumn(TableName.CertificateAuthoritySecret, "hsmKeyId")) {
    await knex.schema.alterTable(TableName.CertificateAuthoritySecret, (t) => {
      t.dropColumn("hsmKeyId");
    });
  }

  if (await knex.schema.hasColumn(TableName.PkiSignerCertificateIssuanceJobs, "hsmKeyId")) {
    await knex.schema.alterTable(TableName.PkiSignerCertificateIssuanceJobs, (t) => {
      t.dropColumn("hsmKeyId");
    });
  }
}
