import { Knex } from "knex";

import { TableName } from "../schemas";

const SIGNER_CERTIFICATE_ISSUANCE_JOBS_TABLE = "pki_signer_certificate_issuance_jobs";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable(TableName.PkiSigners, (t) => {
    t.uuid("caId").nullable();
    t.foreign("caId").references("id").inTable(TableName.CertificateAuthority).onDelete("SET NULL");
    t.index("caId");
    t.string("commonName", 256).nullable();
    t.integer("certificateTtlDays").nullable();
    t.integer("certificateRenewBeforeDays").nullable();
    t.text("certificateFailureReason").nullable();
    t.string("keyAlgorithm", 64).notNullable().defaultTo("RSA_2048");
    t.uuid("certificateId").nullable().alter();
  });

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

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(SIGNER_CERTIFICATE_ISSUANCE_JOBS_TABLE);

  await knex.schema.alterTable(TableName.PkiSigners, (t) => {
    t.dropColumn("keyAlgorithm");
    t.dropColumn("certificateFailureReason");
    t.dropColumn("certificateRenewBeforeDays");
    t.dropColumn("certificateTtlDays");
    t.dropColumn("commonName");
    t.dropIndex("caId");
    t.dropForeign(["caId"]);
    t.dropColumn("caId");
    t.uuid("certificateId").notNullable().alter();
  });
}
