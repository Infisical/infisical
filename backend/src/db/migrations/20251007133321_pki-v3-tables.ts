import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.CertificateTemplateV2))) {
    await knex.schema.createTable(TableName.CertificateTemplateV2, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");

      t.string("name", 64).notNullable();
      t.string("description");

      t.jsonb("attributes");
      t.jsonb("keyUsages");
      t.jsonb("extendedKeyUsages");
      t.jsonb("subjectAlternativeNames");
      t.jsonb("validity");
      t.jsonb("signatureAlgorithm");
      t.jsonb("keyAlgorithm");

      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.CertificateTemplateV2);
  }

  if (!(await knex.schema.hasTable(TableName.EstEnrollmentConfig))) {
    await knex.schema.createTable(TableName.EstEnrollmentConfig, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.boolean("disableBootstrapCaValidation").defaultTo(false);
      t.text("hashedPassphrase").notNullable();
      t.binary("encryptedCaChain").notNullable();

      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.EstEnrollmentConfig);
  }

  if (!(await knex.schema.hasTable(TableName.ApiEnrollmentConfig))) {
    await knex.schema.createTable(TableName.ApiEnrollmentConfig, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.boolean("autoRenew").defaultTo(false);
      t.integer("autoRenewDays");

      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.ApiEnrollmentConfig);
  }

  if (!(await knex.schema.hasTable(TableName.CertificateProfile))) {
    await knex.schema.createTable(TableName.CertificateProfile, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");

      t.uuid("caId").notNullable();
      t.foreign("caId").references("id").inTable(TableName.CertificateAuthority).onDelete("CASCADE");

      t.uuid("certificateTemplateId").notNullable();
      t.foreign("certificateTemplateId").references("id").inTable(TableName.CertificateTemplateV2).onDelete("CASCADE");

      t.string("name", 64).notNullable();
      t.string("slug").notNullable();
      t.string("description");
      t.string("enrollmentType").notNullable().checkIn(["api", "est"]);

      t.uuid("estConfigId");
      t.foreign("estConfigId").references("id").inTable(TableName.EstEnrollmentConfig).onDelete("SET NULL");

      t.uuid("apiConfigId");
      t.foreign("apiConfigId").references("id").inTable(TableName.ApiEnrollmentConfig).onDelete("SET NULL");

      t.timestamps(true, true, true);

      t.unique(["slug", "projectId"], { indexName: "certificate_profiles_slug_project_id_unique" });
    });

    await createOnUpdateTrigger(knex, TableName.CertificateProfile);
  }

  if (!(await knex.schema.hasColumn(TableName.Certificate, "profileId"))) {
    await knex.schema.alterTable(TableName.Certificate, (t) => {
      t.uuid("profileId");
      t.foreign("profileId").references("id").inTable(TableName.CertificateProfile).onDelete("SET NULL");
      t.index("profileId", "idx_certificates_profile_id");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.Certificate, "profileId")) {
    await knex.schema.alterTable(TableName.Certificate, (t) => {
      t.dropForeign(["profileId"]);
      t.dropIndex("profileId", "idx_certificates_profile_id");
      t.dropColumn("profileId");
    });
  }

  await knex.schema.dropTableIfExists(TableName.CertificateProfile);
  await dropOnUpdateTrigger(knex, TableName.CertificateProfile);

  await knex.schema.dropTableIfExists(TableName.ApiEnrollmentConfig);
  await dropOnUpdateTrigger(knex, TableName.ApiEnrollmentConfig);

  await knex.schema.dropTableIfExists(TableName.EstEnrollmentConfig);
  await dropOnUpdateTrigger(knex, TableName.EstEnrollmentConfig);

  await knex.schema.dropTableIfExists(TableName.CertificateTemplateV2);
  await dropOnUpdateTrigger(knex, TableName.CertificateTemplateV2);
}
