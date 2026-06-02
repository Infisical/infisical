import { Knex } from "knex";

import { TableName } from "../schemas";

const SIGNER_CERTIFICATE_ISSUANCE_JOBS_TABLE = "pki_signer_certificate_issuance_jobs";

export async function up(knex: Knex): Promise<void> {
  const hasCaId = await knex.schema.hasColumn(TableName.PkiSigners, "caId");
  const hasCommonName = await knex.schema.hasColumn(TableName.PkiSigners, "commonName");
  const hasCertificateTtlDays = await knex.schema.hasColumn(TableName.PkiSigners, "certificateTtlDays");
  const hasCertificateRenewBeforeDays = await knex.schema.hasColumn(TableName.PkiSigners, "certificateRenewBeforeDays");
  const hasCertificateFailureReason = await knex.schema.hasColumn(TableName.PkiSigners, "certificateFailureReason");
  const hasKeyAlgorithm = await knex.schema.hasColumn(TableName.PkiSigners, "keyAlgorithm");

  if (
    !hasCaId ||
    !hasCommonName ||
    !hasCertificateTtlDays ||
    !hasCertificateRenewBeforeDays ||
    !hasCertificateFailureReason ||
    !hasKeyAlgorithm
  ) {
    await knex.schema.alterTable(TableName.PkiSigners, (t) => {
      if (!hasCaId) {
        t.uuid("caId").nullable();
        t.foreign("caId").references("id").inTable(TableName.CertificateAuthority).onDelete("SET NULL");
        t.index("caId");
      }
      if (!hasCommonName) t.string("commonName", 256).nullable();
      if (!hasCertificateTtlDays) t.integer("certificateTtlDays").nullable();
      if (!hasCertificateRenewBeforeDays) t.integer("certificateRenewBeforeDays").nullable();
      if (!hasCertificateFailureReason) t.text("certificateFailureReason").nullable();
      if (!hasKeyAlgorithm) t.string("keyAlgorithm", 64).notNullable().defaultTo("RSA_2048");
    });
  }

  const certIdRow = await knex
    .select<{ is_nullable: string }>("is_nullable")
    .from("information_schema.columns")
    .where("table_name", TableName.PkiSigners)
    .andWhere("column_name", "certificateId")
    .first();
  if (certIdRow && certIdRow.is_nullable !== "YES") {
    await knex.schema.alterTable(TableName.PkiSigners, (t) => {
      t.uuid("certificateId").nullable().alter();
    });
  }

  if (!(await knex.schema.hasTable(SIGNER_CERTIFICATE_ISSUANCE_JOBS_TABLE))) {
    await knex.schema.createTable(SIGNER_CERTIFICATE_ISSUANCE_JOBS_TABLE, (t) => {
      t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));

      t.uuid("signerId").notNullable();
      t.foreign("signerId").references("id").inTable(TableName.PkiSigners).onDelete("CASCADE");
      t.index("signerId");

      t.uuid("caId").notNullable();
      t.foreign("caId").references("id").inTable(TableName.CertificateAuthority).onDelete("CASCADE");

      t.string("caType", 64).notNullable();
      t.string("status", 32).notNullable();

      t.string("commonName", 256).notNullable();
      t.integer("certificateTtlDays").notNullable();
      t.string("keyAlgorithm", 64).notNullable().defaultTo("RSA_2048");

      t.binary("encryptedPrivateKey");
      t.binary("encryptedCsr");

      t.jsonb("externalOrderRef");

      t.integer("attempts").notNullable().defaultTo(0);
      t.integer("maxAttempts").notNullable().defaultTo(100);
      t.timestamp("nextPollAt", { useTz: true }).notNullable().defaultTo(knex.fn.now());
      t.timestamp("lastAttemptAt", { useTz: true });

      t.text("failureReason");

      t.uuid("certificateId");
      t.foreign("certificateId").references("id").inTable(TableName.Certificate).onDelete("SET NULL");

      t.timestamps(true, true, true);

      t.index(["status", "nextPollAt"], "pki_signer_certificate_issuance_jobs_status_nextPollAt_idx");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(SIGNER_CERTIFICATE_ISSUANCE_JOBS_TABLE);

  const hasKeyAlgorithm = await knex.schema.hasColumn(TableName.PkiSigners, "keyAlgorithm");
  const hasCertificateFailureReason = await knex.schema.hasColumn(TableName.PkiSigners, "certificateFailureReason");
  const hasCertificateRenewBeforeDays = await knex.schema.hasColumn(TableName.PkiSigners, "certificateRenewBeforeDays");
  const hasCertificateTtlDays = await knex.schema.hasColumn(TableName.PkiSigners, "certificateTtlDays");
  const hasCommonName = await knex.schema.hasColumn(TableName.PkiSigners, "commonName");
  const hasCaId = await knex.schema.hasColumn(TableName.PkiSigners, "caId");

  if (
    hasKeyAlgorithm ||
    hasCertificateFailureReason ||
    hasCertificateRenewBeforeDays ||
    hasCertificateTtlDays ||
    hasCommonName ||
    hasCaId
  ) {
    await knex.schema.alterTable(TableName.PkiSigners, (t) => {
      if (hasKeyAlgorithm) t.dropColumn("keyAlgorithm");
      if (hasCertificateFailureReason) t.dropColumn("certificateFailureReason");
      if (hasCertificateRenewBeforeDays) t.dropColumn("certificateRenewBeforeDays");
      if (hasCertificateTtlDays) t.dropColumn("certificateTtlDays");
      if (hasCommonName) t.dropColumn("commonName");
      if (hasCaId) {
        t.dropIndex("caId");
        t.dropForeign(["caId"]);
        t.dropColumn("caId");
      }
    });
  }

  const certIdRow = await knex
    .select<{ is_nullable: string }>("is_nullable")
    .from("information_schema.columns")
    .where("table_name", TableName.PkiSigners)
    .andWhere("column_name", "certificateId")
    .first();
  if (certIdRow && certIdRow.is_nullable === "YES") {
    await knex.schema.alterTable(TableName.PkiSigners, (t) => {
      t.uuid("certificateId").notNullable().alter();
    });
  }
}
