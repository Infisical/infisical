import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.CertificateAuthorityCrl)) {
    const hasCaSecretIdColumn = await knex.schema.hasColumn(TableName.CertificateAuthorityCrl, "caSecretId");
    if (!hasCaSecretIdColumn) {
      await knex.schema.alterTable(TableName.CertificateAuthorityCrl, (t) => {
        t.uuid("caSecretId").nullable();
        t.foreign("caSecretId").references("id").inTable(TableName.CertificateAuthoritySecret).onDelete("CASCADE");
      });

      await knex.raw(`
        UPDATE "${TableName.CertificateAuthorityCrl}" crl
        SET "caSecretId" = (
          SELECT sec.id
          FROM "${TableName.CertificateAuthoritySecret}" sec
          WHERE sec."caId" = crl."caId"
        )
      `);

      await knex.schema.alterTable(TableName.CertificateAuthorityCrl, (t) => {
        t.uuid("caSecretId").notNullable().alter();
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.CertificateAuthorityCrl)) {
    await knex.schema.alterTable(TableName.CertificateAuthorityCrl, (t) => {
      t.dropColumn("caSecretId");
    });
  }
}
