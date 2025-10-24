import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.PkiApiEnrollmentConfig, "autoRenewDays")) {
    await knex.schema.alterTable(TableName.PkiApiEnrollmentConfig, (t) => {
      t.renameColumn("autoRenewDays", "renewBeforeDays");
    });
  }

  if (!(await knex.schema.hasColumn(TableName.Certificate, "renewBeforeDays"))) {
    await knex.schema.alterTable(TableName.Certificate, (t) => {
      t.integer("renewBeforeDays").nullable();
      t.uuid("renewedFromCertificateId").nullable();
      t.uuid("renewedByCertificateId").nullable();
      t.text("renewalError").nullable();
      t.string("keyAlgorithm").nullable();
      t.string("signatureAlgorithm").nullable();
      t.foreign("renewedFromCertificateId").references("id").inTable(TableName.Certificate).onDelete("SET NULL");
      t.foreign("renewedByCertificateId").references("id").inTable(TableName.Certificate).onDelete("SET NULL");
      t.index("renewedFromCertificateId");
      t.index("renewedByCertificateId");
      t.index("renewBeforeDays");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.Certificate, "renewBeforeDays")) {
    await knex.schema.alterTable(TableName.Certificate, (t) => {
      t.dropForeign(["renewedFromCertificateId"]);
      t.dropForeign(["renewedByCertificateId"]);
      t.dropIndex("renewedFromCertificateId");
      t.dropIndex("renewedByCertificateId");
      t.dropIndex("renewBeforeDays");
      t.dropColumn("renewBeforeDays");
      t.dropColumn("renewedFromCertificateId");
      t.dropColumn("renewedByCertificateId");
      t.dropColumn("renewalError");
      t.dropColumn("keyAlgorithm");
      t.dropColumn("signatureAlgorithm");
    });
  }

  if (await knex.schema.hasColumn(TableName.PkiApiEnrollmentConfig, "renewBeforeDays")) {
    await knex.schema.alterTable(TableName.PkiApiEnrollmentConfig, (t) => {
      t.renameColumn("renewBeforeDays", "autoRenewDays");
    });
  }
}
