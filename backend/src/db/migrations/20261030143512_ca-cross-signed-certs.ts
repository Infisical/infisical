import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.CertificateAuthorityCrossSignedCert))) {
    await knex.schema.createTable(TableName.CertificateAuthorityCrossSignedCert, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("caId").notNullable().unique();
      t.foreign("caId").references("id").inTable(TableName.CertificateAuthority).onDelete("CASCADE");
      t.binary("encryptedCertificate").notNullable();
      t.binary("encryptedCertificateChain").nullable();
      t.text("issuer").notNullable();
      t.string("serialNumber").notNullable();
      t.string("publicKeyFingerprint").notNullable();
      t.datetime("notBefore").notNullable();
      t.datetime("notAfter").notNullable();
      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.CertificateAuthorityCrossSignedCert);
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.CertificateAuthorityCrossSignedCert)) {
    await dropOnUpdateTrigger(knex, TableName.CertificateAuthorityCrossSignedCert);
    await knex.schema.dropTableIfExists(TableName.CertificateAuthorityCrossSignedCert);
  }
}
