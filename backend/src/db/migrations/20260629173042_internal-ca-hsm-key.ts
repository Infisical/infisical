import { Knex } from "knex";

import { TableName } from "@app/db/schemas";

const CA_SECRET_KEY_SOURCE_CHK = "certificate_authority_secret_key_source_chk";
const CA_SECRET_HSM_CONNECTOR_FK = "certificate_authority_secret_hsmconnectorid_foreign";
const CA_SECRET_HSM_CONNECTOR_IDX = "certificate_authority_secret_hsmconnectorid_idx";

const constraintExists = async (knex: Knex, table: string, constraintName: string): Promise<boolean> => {
  const result = await knex.raw(
    `SELECT 1 FROM pg_constraint c
     JOIN pg_class t ON t.oid = c.conrelid
     WHERE t.relname = ? AND c.conname = ?`,
    [table, constraintName]
  );
  return result.rows.length > 0;
};

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.CertificateAuthoritySecret))) return;

  const hasKeySource = await knex.schema.hasColumn(TableName.CertificateAuthoritySecret, "keySource");
  const hasHsmConnectorId = await knex.schema.hasColumn(TableName.CertificateAuthoritySecret, "hsmConnectorId");
  const hasHsmKeyLabel = await knex.schema.hasColumn(TableName.CertificateAuthoritySecret, "hsmKeyLabel");
  const hasHsmPublicKeySpki = await knex.schema.hasColumn(TableName.CertificateAuthoritySecret, "hsmPublicKeySpki");

  if (!hasKeySource || !hasHsmConnectorId || !hasHsmKeyLabel || !hasHsmPublicKeySpki) {
    await knex.schema.alterTable(TableName.CertificateAuthoritySecret, (t) => {
      if (!hasKeySource) {
        t.string("keySource", 32).notNullable().defaultTo("infisical");
      }
      if (!hasHsmConnectorId) {
        t.uuid("hsmConnectorId").nullable();
        t.foreign("hsmConnectorId", CA_SECRET_HSM_CONNECTOR_FK)
          .references("id")
          .inTable(TableName.HsmConnector)
          .onDelete("RESTRICT");
        t.index(["hsmConnectorId"], CA_SECRET_HSM_CONNECTOR_IDX, { predicate: knex.whereNotNull("hsmConnectorId") });
      }
      if (!hasHsmKeyLabel) {
        t.string("hsmKeyLabel", 128).nullable();
      }
      if (!hasHsmPublicKeySpki) {
        t.binary("hsmPublicKeySpki").nullable();
      }
    });
  }

  // HSM-backed CAs have no locally stored private key, so the column must become nullable.
  await knex.schema.alterTable(TableName.CertificateAuthoritySecret, (t) => {
    t.binary("encryptedPrivateKey").nullable().alter();
  });

  if (!(await constraintExists(knex, TableName.CertificateAuthoritySecret, CA_SECRET_KEY_SOURCE_CHK))) {
    await knex.raw(
      `ALTER TABLE ?? ADD CONSTRAINT ?? CHECK (
        ("keySource" = 'infisical' AND "encryptedPrivateKey" IS NOT NULL)
        OR
        ("keySource" = 'hsm' AND "hsmConnectorId" IS NOT NULL AND "hsmKeyLabel" IS NOT NULL)
      ) NOT VALID`,
      [TableName.CertificateAuthoritySecret, CA_SECRET_KEY_SOURCE_CHK]
    );
    await knex.raw(`ALTER TABLE ?? VALIDATE CONSTRAINT ??`, [
      TableName.CertificateAuthoritySecret,
      CA_SECRET_KEY_SOURCE_CHK
    ]);
  }
}

export async function down(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.CertificateAuthoritySecret))) return;

  if (await constraintExists(knex, TableName.CertificateAuthoritySecret, CA_SECRET_KEY_SOURCE_CHK)) {
    await knex.raw(`ALTER TABLE ?? DROP CONSTRAINT ??`, [
      TableName.CertificateAuthoritySecret,
      CA_SECRET_KEY_SOURCE_CHK
    ]);
  }

  const hasKeySource = await knex.schema.hasColumn(TableName.CertificateAuthoritySecret, "keySource");
  const hasHsmConnectorId = await knex.schema.hasColumn(TableName.CertificateAuthoritySecret, "hsmConnectorId");
  const hasHsmKeyLabel = await knex.schema.hasColumn(TableName.CertificateAuthoritySecret, "hsmKeyLabel");
  const hasHsmPublicKeySpki = await knex.schema.hasColumn(TableName.CertificateAuthoritySecret, "hsmPublicKeySpki");

  if (hasKeySource || hasHsmConnectorId || hasHsmKeyLabel || hasHsmPublicKeySpki) {
    await knex.schema.alterTable(TableName.CertificateAuthoritySecret, (t) => {
      if (hasHsmPublicKeySpki) t.dropColumn("hsmPublicKeySpki");
      if (hasHsmKeyLabel) t.dropColumn("hsmKeyLabel");
      if (hasHsmConnectorId) t.dropColumn("hsmConnectorId");
      if (hasKeySource) t.dropColumn("keySource");
    });
  }
}
