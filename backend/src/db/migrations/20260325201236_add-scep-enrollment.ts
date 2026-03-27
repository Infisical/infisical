import { Knex } from "knex";

import { dropConstraintIfExists } from "@app/db/migrations/utils/dropConstraintIfExists";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

const ENROLLMENT_TYPE_CHECK_CONSTRAINT = "pki_certificate_profiles_enrollment_type_check";
const SCEP_TRANSACTION_UNIQUE_INDEX = "pki_scep_transactions_profile_id_transaction_id_unique";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.PkiScepEnrollmentConfig))) {
    await knex.schema.createTable(TableName.PkiScepEnrollmentConfig, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.binary("encryptedRaPrivateKey").notNullable();
      t.text("raCertificate").notNullable();
      t.timestamp("raCertExpiresAt").notNullable();
      t.text("hashedChallengePassword").notNullable();
      t.boolean("includeCaCertInResponse").notNullable().defaultTo(true);
      t.boolean("allowCertBasedRenewal").notNullable().defaultTo(true);
      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.PkiScepEnrollmentConfig);
  }

  if (!(await knex.schema.hasTable(TableName.PkiScepTransaction))) {
    await knex.schema.createTable(TableName.PkiScepTransaction, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.uuid("profileId").notNullable();
      t.foreign("profileId").references("id").inTable(TableName.PkiCertificateProfile).onDelete("CASCADE");

      t.string("transactionId", 256).notNullable();
      t.binary("senderNonce").notNullable();
      t.binary("signerCertDer").notNullable();

      // No FK — certificate_requests is partitioned (composite PK: id + createdAt) so PostgreSQL cannot enforce a FK referencing just id.
      t.uuid("certificateRequestId").nullable();
      t.index("certificateRequestId");

      t.string("clientCipherOid", 64).nullable();

      t.timestamp("expiresAt").notNullable();
      t.index("expiresAt");

      t.timestamps(true, true, true);

      t.unique(["profileId", "transactionId"], { indexName: SCEP_TRANSACTION_UNIQUE_INDEX });
    });

    await createOnUpdateTrigger(knex, TableName.PkiScepTransaction);
  }

  if (!(await knex.schema.hasColumn(TableName.PkiCertificateProfile, "scepConfigId"))) {
    await knex.schema.alterTable(TableName.PkiCertificateProfile, (t) => {
      t.uuid("scepConfigId");
      t.foreign("scepConfigId").references("id").inTable(TableName.PkiScepEnrollmentConfig).onDelete("SET NULL");
      t.index("scepConfigId");
    });
  }

  await dropConstraintIfExists(TableName.PkiCertificateProfile, ENROLLMENT_TYPE_CHECK_CONSTRAINT, knex);
  if (await knex.schema.hasColumn(TableName.PkiCertificateProfile, "enrollmentType")) {
    await knex.schema.alterTable(TableName.PkiCertificateProfile, (t) => {
      t.string("enrollmentType")
        .notNullable()
        .checkIn(["api", "est", "acme", "scep"], ENROLLMENT_TYPE_CHECK_CONSTRAINT)
        .alter();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.PkiScepTransaction)) {
    await knex.schema.dropTable(TableName.PkiScepTransaction);
    await dropOnUpdateTrigger(knex, TableName.PkiScepTransaction);
  }

  await dropConstraintIfExists(TableName.PkiCertificateProfile, ENROLLMENT_TYPE_CHECK_CONSTRAINT, knex);
  if (await knex.schema.hasColumn(TableName.PkiCertificateProfile, "enrollmentType")) {
    await knex.schema.alterTable(TableName.PkiCertificateProfile, (t) => {
      t.string("enrollmentType")
        .notNullable()
        .checkIn(["api", "est", "acme"], ENROLLMENT_TYPE_CHECK_CONSTRAINT)
        .alter();
    });
  }

  if (await knex.schema.hasColumn(TableName.PkiCertificateProfile, "scepConfigId")) {
    await knex.schema.alterTable(TableName.PkiCertificateProfile, (t) => {
      t.dropForeign(["scepConfigId"]);
      t.dropIndex("scepConfigId");
      t.dropColumn("scepConfigId");
    });
  }

  if (await knex.schema.hasTable(TableName.PkiScepEnrollmentConfig)) {
    await knex.schema.dropTable(TableName.PkiScepEnrollmentConfig);
    await dropOnUpdateTrigger(knex, TableName.PkiScepEnrollmentConfig);
  }
}
