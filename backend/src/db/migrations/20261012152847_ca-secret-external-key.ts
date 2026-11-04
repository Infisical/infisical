import { Knex } from "knex";

import { TableName } from "@app/db/schemas";

const CA_SECRET_KEY_SOURCE_CHK = "certificate_authority_secret_key_source_chk";
const CA_SECRET_APP_CONNECTION_IDX = "certificate_authority_secret_appconnectionid_idx";

const INFISICAL_ARM = `("keySource" = 'infisical' AND "encryptedPrivateKey" IS NOT NULL)`;
const LEGACY_HSM_ARM = `("keySource" = 'hsm' AND "hsmConnectorId" IS NOT NULL AND "hsmKeyLabel" IS NOT NULL)`;
const HSM_ARM = `("keySource" = 'hsm' AND "hsmConnectorId" IS NOT NULL AND "externalKeyId" IS NOT NULL)`;
const AWS_KMS_ARM = `("keySource" = 'aws-kms' AND "appConnectionId" IS NOT NULL AND "externalKeyId" IS NOT NULL AND "publicKeySpki" IS NOT NULL)`;

const replaceKeySourceConstraint = (knex: Knex, arms: string[]) =>
  knex.raw(`ALTER TABLE ?? DROP CONSTRAINT IF EXISTS ??, ADD CONSTRAINT ?? CHECK (${arms.join(" OR ")})`, [
    TableName.CertificateAuthoritySecret,
    CA_SECRET_KEY_SOURCE_CHK,
    CA_SECRET_KEY_SOURCE_CHK
  ]);

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.CertificateAuthoritySecret, "externalKeyId")) return;

  await knex.schema.alterTable(TableName.CertificateAuthoritySecret, (t) => {
    t.uuid("appConnectionId").nullable();
    t.foreign("appConnectionId").references("id").inTable(TableName.AppConnection).deferrable("deferred");
    t.index(["appConnectionId"], CA_SECRET_APP_CONNECTION_IDX, { predicate: knex.whereNotNull("appConnectionId") });
    t.string("externalKeyId", 2048).nullable();
    t.binary("publicKeySpki").nullable();
  });

  await knex.raw(
    `UPDATE ?? SET "externalKeyId" = "hsmKeyLabel", "publicKeySpki" = "hsmPublicKeySpki" WHERE "keySource" = 'hsm'`,
    [TableName.CertificateAuthoritySecret]
  );

  await replaceKeySourceConstraint(knex, [INFISICAL_ARM, HSM_ARM, AWS_KMS_ARM]);

  await knex.schema.alterTable(TableName.CertificateAuthoritySecret, (t) => {
    t.dropColumn("hsmKeyLabel");
    t.dropColumn("hsmPublicKeySpki");
  });
}

export async function down(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.CertificateAuthoritySecret, "externalKeyId"))) return;

  await knex.schema.alterTable(TableName.CertificateAuthoritySecret, (t) => {
    t.string("hsmKeyLabel", 128).nullable();
    t.binary("hsmPublicKeySpki").nullable();
  });

  await knex.raw(
    `UPDATE ?? SET "hsmKeyLabel" = "externalKeyId", "hsmPublicKeySpki" = "publicKeySpki" WHERE "keySource" = 'hsm'`,
    [TableName.CertificateAuthoritySecret]
  );

  await replaceKeySourceConstraint(knex, [INFISICAL_ARM, LEGACY_HSM_ARM]);

  await knex.schema.alterTable(TableName.CertificateAuthoritySecret, (t) => {
    t.dropColumn("publicKeySpki");
    t.dropColumn("externalKeyId");
    t.dropColumn("appConnectionId");
  });
}
