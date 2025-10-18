import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.PkiCertificateTemplateV2))) {
    await knex.schema.createTable(TableName.PkiCertificateTemplateV2, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project);

      t.string("name").notNullable();
      t.string("description");

      t.jsonb("subject");
      t.jsonb("sans");
      t.jsonb("keyUsages");
      t.jsonb("extendedKeyUsages");
      t.jsonb("algorithms");
      t.jsonb("validity");

      t.timestamps(true, true, true);

      t.unique(["name", "projectId"]);
    });

    await createOnUpdateTrigger(knex, TableName.PkiCertificateTemplateV2);
  }

  if (!(await knex.schema.hasTable(TableName.PkiEstEnrollmentConfig))) {
    await knex.schema.createTable(TableName.PkiEstEnrollmentConfig, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.boolean("disableBootstrapCaValidation").defaultTo(false);
      t.text("hashedPassphrase").notNullable();
      t.binary("encryptedCaChain");

      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.PkiEstEnrollmentConfig);
  }

  if (!(await knex.schema.hasTable(TableName.PkiApiEnrollmentConfig))) {
    await knex.schema.createTable(TableName.PkiApiEnrollmentConfig, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.boolean("autoRenew").defaultTo(false);
      t.integer("autoRenewDays");

      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.PkiApiEnrollmentConfig);
  }

  if (!(await knex.schema.hasTable(TableName.PkiCertificateProfile))) {
    await knex.schema.createTable(TableName.PkiCertificateProfile, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");

      t.uuid("caId").notNullable();
      t.foreign("caId").references("id").inTable(TableName.CertificateAuthority);

      t.uuid("certificateTemplateId").notNullable();
      t.foreign("certificateTemplateId").references("id").inTable(TableName.PkiCertificateTemplateV2);

      t.string("slug").notNullable();
      t.string("description");
      t.string("enrollmentType").notNullable().checkIn(["api", "est"]);

      t.uuid("estConfigId");
      t.foreign("estConfigId").references("id").inTable(TableName.PkiEstEnrollmentConfig).onDelete("SET NULL");

      t.uuid("apiConfigId");
      t.foreign("apiConfigId").references("id").inTable(TableName.PkiApiEnrollmentConfig).onDelete("SET NULL");

      t.timestamps(true, true, true);

      t.unique(["slug", "projectId"]);
    });

    await createOnUpdateTrigger(knex, TableName.PkiCertificateProfile);
  }

  if (!(await knex.schema.hasColumn(TableName.Certificate, "profileId"))) {
    await knex.schema.alterTable(TableName.Certificate, (t) => {
      t.uuid("profileId");
      t.foreign("profileId").references("id").inTable(TableName.PkiCertificateProfile).onDelete("SET NULL");
      t.index("profileId");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.Certificate, "profileId")) {
    await knex.schema.alterTable(TableName.Certificate, (t) => {
      t.dropForeign(["profileId"]);
      t.dropIndex("profileId");
      t.dropColumn("profileId");
    });
  }

  await knex.schema.dropTableIfExists(TableName.PkiCertificateProfile);
  await dropOnUpdateTrigger(knex, TableName.PkiCertificateProfile);

  await knex.schema.dropTableIfExists(TableName.PkiApiEnrollmentConfig);
  await dropOnUpdateTrigger(knex, TableName.PkiApiEnrollmentConfig);

  await knex.schema.dropTableIfExists(TableName.PkiEstEnrollmentConfig);
  await dropOnUpdateTrigger(knex, TableName.PkiEstEnrollmentConfig);

  await knex.schema.dropTableIfExists(TableName.PkiCertificateTemplateV2);
  await dropOnUpdateTrigger(knex, TableName.PkiCertificateTemplateV2);
}
