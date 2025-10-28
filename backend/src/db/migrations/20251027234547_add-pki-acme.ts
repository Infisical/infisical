import { Knex } from "knex";
import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";
import { dropConstraintIfExists } from "@app/db/migrations/utils/dropConstraintIfExists";

const ENROLLMENT_TYPE_CHECK_CONSTRAINT = "pki_certificate_profiles_enrollmentType_check";

export async function up(knex: Knex): Promise<void> {
  // Create PkiAcmeEnrollmentConfig table
  if (!(await knex.schema.hasTable(TableName.PkiAcmeEnrollmentConfig))) {
    await knex.schema.createTable(TableName.PkiAcmeEnrollmentConfig, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.binary("encryptedEabSecret").notNullable();

      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.PkiAcmeEnrollmentConfig);
  }

  if (!(await knex.schema.hasColumn(TableName.PkiCertificateProfile, "acmeConfigId"))) {
    await knex.schema.alterTable(TableName.PkiCertificateProfile, (t) => {
      t.uuid("acmeConfigId");
      t.foreign("acmeConfigId").references("id").inTable(TableName.PkiAcmeEnrollmentConfig).onDelete("SET NULL");
      t.index("acmeConfigId");
    });
  }

  await dropConstraintIfExists(TableName.PkiCertificateProfile, ENROLLMENT_TYPE_CHECK_CONSTRAINT, knex);
  if (await knex.schema.hasColumn(TableName.PkiCertificateProfile, "enrollmentType")) {
    await knex.schema.alterTable(TableName.PkiCertificateProfile, (t) => {
      t.string("enrollmentType").checkIn(["api", "est", "acme"], ENROLLMENT_TYPE_CHECK_CONSTRAINT).alter();
    });
  }

  // Create PkiAcmeAccount table
  if (!(await knex.schema.hasTable(TableName.PkiAcmeAccount))) {
    await knex.schema.createTable(TableName.PkiAcmeAccount, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      // Foreign key to PkiCertificateProfile
      t.uuid("profileId").notNullable();
      t.foreign("profileId").references("id").inTable(TableName.PkiCertificateProfile).onDelete("CASCADE");

      // Multi-value emails array
      t.specificType("emails", "text[]").notNullable();

      // Public key (PEM format)
      t.text("publicKey").notNullable();

      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.PkiAcmeAccount);
  }

  // Create PkiAcmeOrder table
  if (!(await knex.schema.hasTable(TableName.PkiAcmeOrder))) {
    await knex.schema.createTable(TableName.PkiAcmeOrder, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      // Foreign key to PkiAcmeAccount
      t.uuid("accountId").notNullable();
      t.foreign("accountId").references("id").inTable(TableName.PkiAcmeAccount).onDelete("CASCADE");

      // Order status
      t.string("status").notNullable(); // pending, ready, processing, valid, invalid

      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.PkiAcmeOrder);
  }

  // Create PkiAcmeAuth table
  if (!(await knex.schema.hasTable(TableName.PkiAcmeAuth))) {
    await knex.schema.createTable(TableName.PkiAcmeAuth, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      // Foreign key to PkiAcmeAccount
      t.uuid("accountId").notNullable();
      t.foreign("accountId").references("id").inTable(TableName.PkiAcmeAccount).onDelete("CASCADE");

      // Authorization status
      t.string("status").notNullable(); // pending, valid, invalid, deactivated, expired, revoked

      // Identifier type and value
      t.string("identifierType").notNullable(); // dns
      t.string("identifierValue").notNullable(); // domain name

      // Expiration timestamp
      t.timestamp("expiresAt").notNullable();

      // Optional link to issued certificate
      t.uuid("certificateId").nullable();
      t.foreign("certificateId").references("id").inTable(TableName.Certificate).onDelete("SET NULL");

      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.PkiAcmeAuth);
  }

  // Create PkiAcmeChallenge table
  if (!(await knex.schema.hasTable(TableName.PkiAcmeChallenge))) {
    await knex.schema.createTable(TableName.PkiAcmeChallenge, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      // Foreign key to PkiAcmeAuth
      t.uuid("authId").notNullable();
      t.foreign("authId").references("id").inTable(TableName.PkiAcmeAuth).onDelete("CASCADE");

      // Challenge type
      t.string("type").notNullable(); // http-01, dns-01, tls-alpn-01

      // Challenge status
      t.string("status").notNullable(); // pending, processing, valid, invalid

      // Validation timestamp
      t.timestamp("validatedAt").nullable();

      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.PkiAcmeChallenge);
  }
}

export async function down(knex: Knex): Promise<void> {
  // Drop tables in reverse dependency order

  // Drop PkiAcmeChallenge first (depends on PkiAcmeAuth)
  if (await knex.schema.hasTable(TableName.PkiAcmeChallenge)) {
    await knex.schema.dropTable(TableName.PkiAcmeChallenge);
    await dropOnUpdateTrigger(knex, TableName.PkiAcmeChallenge);
  }

  // Drop PkiAcmeAuth (depends on PkiAcmeAccount and Certificate)
  if (await knex.schema.hasTable(TableName.PkiAcmeAuth)) {
    await knex.schema.dropTable(TableName.PkiAcmeAuth);
    await dropOnUpdateTrigger(knex, TableName.PkiAcmeAuth);
  }

  // Drop PkiAcmeOrder (depends on PkiAcmeAccount)
  if (await knex.schema.hasTable(TableName.PkiAcmeOrder)) {
    await knex.schema.dropTable(TableName.PkiAcmeOrder);
    await dropOnUpdateTrigger(knex, TableName.PkiAcmeOrder);
  }

  // Drop PkiAcmeAccount (depends on PkiCertificateProfile)
  if (await knex.schema.hasTable(TableName.PkiAcmeAccount)) {
    await knex.schema.dropTable(TableName.PkiAcmeAccount);
    await dropOnUpdateTrigger(knex, TableName.PkiAcmeAccount);
  }

  // Change enrollmentType check constraint to only allow api and est
  await dropConstraintIfExists(TableName.PkiCertificateProfile, ENROLLMENT_TYPE_CHECK_CONSTRAINT, knex);
  if (await knex.schema.hasColumn(TableName.PkiCertificateProfile, "enrollmentType")) {
    await knex.schema.alterTable(TableName.PkiCertificateProfile, (t) => {
      t.string("enrollmentType").checkIn(["api", "est"], ENROLLMENT_TYPE_CHECK_CONSTRAINT).alter();
    });
  }

  // Drop acmeConfigId column
  if (await knex.schema.hasColumn(TableName.PkiCertificateProfile, "acmeConfigId")) {
    await knex.schema.alterTable(TableName.PkiCertificateProfile, (t) => {
      t.dropForeign(["acmeConfigId"]);
      t.dropIndex("acmeConfigId");
      t.dropColumn("acmeConfigId");
    });
  }

  // Drop PkiAcmeEnrollmentConfig
  if (await knex.schema.hasTable(TableName.PkiAcmeEnrollmentConfig)) {
    await knex.schema.dropTable(TableName.PkiAcmeEnrollmentConfig);
    await dropOnUpdateTrigger(knex, TableName.PkiAcmeEnrollmentConfig);
  }
}
