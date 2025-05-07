import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.CertificateBody, "encryptedCertificateChain");
  if (!hasColumn) {
    await knex.schema.alterTable(TableName.CertificateBody, (t) => {
      t.binary("encryptedCertificateChain").nullable();
    });
  }

  if (!(await knex.schema.hasTable(TableName.CertificateSecret))) {
    await knex.schema.createTable(TableName.CertificateSecret, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.timestamps(true, true, true);
      t.uuid("certId").notNullable().unique();
      t.foreign("certId").references("id").inTable(TableName.Certificate).onDelete("CASCADE");
      t.binary("encryptedPrivateKey").notNullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.CertificateSecret);

  const hasColumn = await knex.schema.hasColumn(TableName.CertificateBody, "encryptedCertificateChain");
  if (hasColumn) {
    await knex.schema.alterTable(TableName.CertificateBody, (t) => {
      t.dropColumn("encryptedCertificateChain");
    });
  }
}
