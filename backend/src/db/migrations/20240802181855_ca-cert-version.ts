import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.CertificateAuthority)) {
    const hasActiveCaCertIdColumn = await knex.schema.hasColumn(TableName.CertificateAuthority, "activeCaCertId");
    if (!hasActiveCaCertIdColumn) {
      await knex.schema.alterTable(TableName.CertificateAuthority, (t) => {
        t.uuid("activeCaCertId").nullable();
        t.foreign("activeCaCertId").references("id").inTable(TableName.CertificateAuthorityCert);
      });

      await knex.raw(`
        UPDATE "${TableName.CertificateAuthority}" ca
        SET "activeCaCertId" = cac.id
        FROM "${TableName.CertificateAuthorityCert}" cac
        WHERE ca.id = cac."caId"
      `);
    }
  }

  if (await knex.schema.hasTable(TableName.CertificateAuthorityCert)) {
    const hasVersionColumn = await knex.schema.hasColumn(TableName.CertificateAuthorityCert, "version");
    if (!hasVersionColumn) {
      await knex.schema.alterTable(TableName.CertificateAuthorityCert, (t) => {
        t.integer("version").nullable();
        t.dropUnique(["caId"]);
      });

      await knex(TableName.CertificateAuthorityCert).update({ version: 1 }).whereNull("version");

      await knex.schema.alterTable(TableName.CertificateAuthorityCert, (t) => {
        t.integer("version").notNullable().alter();
      });
    }

    const hasCaSecretIdColumn = await knex.schema.hasColumn(TableName.CertificateAuthorityCert, "caSecretId");
    if (!hasCaSecretIdColumn) {
      await knex.schema.alterTable(TableName.CertificateAuthorityCert, (t) => {
        t.uuid("caSecretId").nullable();
        t.foreign("caSecretId").references("id").inTable(TableName.CertificateAuthoritySecret).onDelete("CASCADE");
      });

      await knex.raw(`
        UPDATE "${TableName.CertificateAuthorityCert}" cert
        SET "caSecretId" = (
          SELECT sec.id
          FROM "${TableName.CertificateAuthoritySecret}" sec
          WHERE sec."caId" = cert."caId"
        )
      `);

      await knex.schema.alterTable(TableName.CertificateAuthorityCert, (t) => {
        t.uuid("caSecretId").notNullable().alter();
      });
    }
  }

  if (await knex.schema.hasTable(TableName.CertificateAuthoritySecret)) {
    await knex.schema.alterTable(TableName.CertificateAuthoritySecret, (t) => {
      t.dropUnique(["caId"]);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.CertificateAuthority)) {
    if (await knex.schema.hasColumn(TableName.CertificateAuthority, "activeCaCertId")) {
      await knex.schema.alterTable(TableName.CertificateAuthority, (t) => {
        t.dropColumn("activeCaCertId");
      });
    }
  }

  if (await knex.schema.hasTable(TableName.CertificateAuthorityCert)) {
    if (await knex.schema.hasColumn(TableName.CertificateAuthorityCert, "version")) {
      await knex.schema.alterTable(TableName.CertificateAuthorityCert, (t) => {
        t.dropColumn("version");
      });
    }

    if (await knex.schema.hasColumn(TableName.CertificateAuthorityCert, "caSecretId")) {
      await knex.schema.alterTable(TableName.CertificateAuthorityCert, (t) => {
        t.dropColumn("caSecretId");
      });
    }
  }
}
