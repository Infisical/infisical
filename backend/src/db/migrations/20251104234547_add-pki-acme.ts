import { Knex } from "knex";
import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";
import { dropConstraintIfExists } from "@app/db/migrations/utils/dropConstraintIfExists";

// Notice: the old constraint name is "enrollmentType_check" instead of "enrollment_type_check"
//         with psql, if there's no quote around an identifier, it will be lowercased.
//         this may cause issues in migrations as Knex sometimes generates identifiers without quotes.
//         to avoid this, we use a new constraint name that contains only lowercase letters and underscores.
const OLD_ENROLLMENT_TYPE_CHECK_CONSTRAINT = "pki_certificate_profiles_enrollmentType_check";
const NEW_ENROLLMENT_TYPE_CHECK_CONSTRAINT = "pki_certificate_profiles_enrollment_type_check";

const PUBLIC_KEY_THUMBPRINT_ALG_INDEX = "pki_acme_accounts_publicKey_thumbprint_alg_index";

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

  await dropConstraintIfExists(TableName.PkiCertificateProfile, OLD_ENROLLMENT_TYPE_CHECK_CONSTRAINT, knex);
  if (await knex.schema.hasColumn(TableName.PkiCertificateProfile, "enrollmentType")) {
    // Notice: it's okay to use `.checkIn(...).alter();` here because the constraint name is all lowercase.
    await knex.schema.alterTable(TableName.PkiCertificateProfile, (t) => {
      t.string("enrollmentType")
        .notNullable()
        .checkIn(["api", "est", "acme"], NEW_ENROLLMENT_TYPE_CHECK_CONSTRAINT)
        .alter();
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

      // Public key (JWK format)
      t.jsonb("publicKey").notNullable();
      // Public key thumbprint
      t.string("publicKeyThumbprint").notNullable();
      // The JWS algorithm used to sign the public key when creating the account, e.g. "RS256", "ES256", "PS256", etc.
      t.string("alg").notNullable();
      // We may need to look up existing accounts by public key thumbprint and algorithm, so we index on both of them.
      t.index(["publicKeyThumbprint", "alg"], PUBLIC_KEY_THUMBPRINT_ALG_INDEX);

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

      // Foreign key to certificate
      t.uuid("certificateId").nullable();
      t.foreign("certificateId").references("id").inTable(TableName.Certificate).onDelete("CASCADE");

      t.timestamp("notBefore").nullable();
      t.timestamp("notAfter").nullable();

      t.timestamp("expiresAt").notNullable();

      t.text("csr").nullable();
      t.text("error").nullable();
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

      // Token used to validate the authorization through ACME challenge
      t.string("token").nullable();

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

  // Create PkiAcmeOrderAuth table
  if (!(await knex.schema.hasTable(TableName.PkiAcmeOrderAuth))) {
    await knex.schema.createTable(TableName.PkiAcmeOrderAuth, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      // Foreign key to PkiAcmeOrder
      t.uuid("orderId").notNullable();
      t.foreign("orderId").references("id").inTable(TableName.PkiAcmeOrder).onDelete("CASCADE");

      // Foreign key to PkiAcmeAuth
      t.uuid("authId").notNullable();
      t.foreign("authId").references("id").inTable(TableName.PkiAcmeAuth).onDelete("CASCADE");

      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.PkiAcmeOrderAuth);
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

      // Error message when the challenge fails
      t.string("error").nullable();

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

  // Drop PkiAcmeOrderAuth (depends on PkiAcmeOrder and PkiAcmeAuth)
  if (await knex.schema.hasTable(TableName.PkiAcmeOrderAuth)) {
    await knex.schema.dropTable(TableName.PkiAcmeOrderAuth);
    await dropOnUpdateTrigger(knex, TableName.PkiAcmeOrderAuth);
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

  // Change enrollmentType check constraint to allow acme
  await dropConstraintIfExists(TableName.PkiCertificateProfile, NEW_ENROLLMENT_TYPE_CHECK_CONSTRAINT, knex);
  if (await knex.schema.hasColumn(TableName.PkiCertificateProfile, "enrollmentType")) {
    // Notice: DO NOT USE
    //
    //   `t.string("enrollmentType").checkIn(["api", "est"], OLD_ENROLLMENT_TYPE_CHECK_CONSTRAINT).alter();`
    //
    // here because knex will generate a constraint name without quotes, and it will be treated as lowercased and causing problems.
    await knex.raw(
      `ALTER TABLE ??
          ADD CONSTRAINT ?? CHECK (?? IN ('api', 'est'));
      `,
      [TableName.PkiCertificateProfile, OLD_ENROLLMENT_TYPE_CHECK_CONSTRAINT, "enrollmentType"]
    );
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
