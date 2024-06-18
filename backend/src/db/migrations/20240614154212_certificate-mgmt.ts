import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.Project)) {
    const doesProjectCertificateKeyIdExist = await knex.schema.hasColumn(TableName.Project, "kmsCertificateKeyId");
    await knex.schema.alterTable(TableName.Project, (t) => {
      if (!doesProjectCertificateKeyIdExist) {
        t.uuid("kmsCertificateKeyId").nullable();
        t.foreign("kmsCertificateKeyId").references("id").inTable(TableName.KmsKey);
      }
    });
  }

  if (!(await knex.schema.hasTable(TableName.CertificateAuthority))) {
    await knex.schema.createTable(TableName.CertificateAuthority, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.timestamps(true, true, true);
      t.uuid("parentCaId").nullable();
      t.foreign("parentCaId").references("id").inTable(TableName.CertificateAuthority).onDelete("CASCADE");
      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.string("type").notNullable(); // root / intermediate
      t.string("status").notNullable(); // active / pending-certificate
      t.string("friendlyName").notNullable();
      t.string("organization").notNullable();
      t.string("ou").notNullable();
      t.string("country").notNullable();
      t.string("province").notNullable();
      t.string("locality").notNullable();
      t.string("commonName").notNullable();
      t.string("dn").notNullable();
      t.string("serialNumber").nullable().unique();
      t.integer("maxPathLength").nullable();
      t.string("keyAlgorithm").notNullable();
      t.datetime("notBefore").nullable();
      t.datetime("notAfter").nullable();
    });
  }

  if (!(await knex.schema.hasTable(TableName.CertificateAuthorityCert))) {
    // table to keep track of certificates belonging to CA
    await knex.schema.createTable(TableName.CertificateAuthorityCert, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.timestamps(true, true, true);
      t.uuid("caId").notNullable().unique();
      t.foreign("caId").references("id").inTable(TableName.CertificateAuthority).onDelete("CASCADE");
      t.binary("encryptedCertificate").notNullable();
      t.binary("encryptedCertificateChain").notNullable();
    });
  }

  if (!(await knex.schema.hasTable(TableName.CertificateAuthoritySecret))) {
    await knex.schema.createTable(TableName.CertificateAuthoritySecret, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.timestamps(true, true, true);
      t.uuid("caId").notNullable().unique();
      t.foreign("caId").references("id").inTable(TableName.CertificateAuthority).onDelete("CASCADE");
      t.binary("encryptedPrivateKey").notNullable();
    });
  }

  if (!(await knex.schema.hasTable(TableName.CertificateAuthorityCrl))) {
    await knex.schema.createTable(TableName.CertificateAuthorityCrl, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.timestamps(true, true, true);
      t.uuid("caId").notNullable().unique();
      t.foreign("caId").references("id").inTable(TableName.CertificateAuthority).onDelete("CASCADE");
      t.binary("encryptedCrl").notNullable();
    });
  }

  if (!(await knex.schema.hasTable(TableName.Certificate))) {
    await knex.schema.createTable(TableName.Certificate, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.timestamps(true, true, true);
      t.uuid("caId").notNullable();
      t.foreign("caId").references("id").inTable(TableName.CertificateAuthority).onDelete("CASCADE");
      t.string("status").notNullable(); // active / pending-certificate
      t.string("serialNumber").notNullable().unique();
      t.string("friendlyName").notNullable();
      t.string("commonName").notNullable();
      t.datetime("notBefore").notNullable();
      t.datetime("notAfter").notNullable();
      t.datetime("revokedAt").nullable();
      t.integer("revocationReason").nullable(); // integer based on crl reason in RFC 5280
    });
  }

  if (!(await knex.schema.hasTable(TableName.CertificateBody))) {
    await knex.schema.createTable(TableName.CertificateBody, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.timestamps(true, true, true);
      t.uuid("certId").notNullable().unique();
      t.foreign("certId").references("id").inTable(TableName.Certificate).onDelete("CASCADE");
      t.binary("encryptedCertificate").notNullable();
    });
  }

  await createOnUpdateTrigger(knex, TableName.CertificateAuthority);
  await createOnUpdateTrigger(knex, TableName.CertificateAuthorityCert);
  await createOnUpdateTrigger(knex, TableName.CertificateAuthoritySecret);
  await createOnUpdateTrigger(knex, TableName.Certificate);
  await createOnUpdateTrigger(knex, TableName.CertificateBody);
}

export async function down(knex: Knex): Promise<void> {
  // project
  if (await knex.schema.hasTable(TableName.Project)) {
    const doesProjectCertificateKeyIdExist = await knex.schema.hasColumn(TableName.Project, "kmsCertificateKeyId");
    await knex.schema.alterTable(TableName.Project, (t) => {
      if (doesProjectCertificateKeyIdExist) t.dropColumn("kmsCertificateKeyId");
    });
  }

  // certificates
  await knex.schema.dropTableIfExists(TableName.CertificateBody);
  await dropOnUpdateTrigger(knex, TableName.CertificateBody);

  await knex.schema.dropTableIfExists(TableName.Certificate);
  await dropOnUpdateTrigger(knex, TableName.Certificate);

  // certificate authorities
  await knex.schema.dropTableIfExists(TableName.CertificateAuthoritySecret);
  await dropOnUpdateTrigger(knex, TableName.CertificateAuthoritySecret);

  await knex.schema.dropTableIfExists(TableName.CertificateAuthorityCrl);
  await dropOnUpdateTrigger(knex, TableName.CertificateAuthorityCrl);

  await knex.schema.dropTableIfExists(TableName.CertificateAuthorityCert);
  await dropOnUpdateTrigger(knex, TableName.CertificateAuthorityCert);

  await knex.schema.dropTableIfExists(TableName.CertificateAuthority);
  await dropOnUpdateTrigger(knex, TableName.CertificateAuthority);
}
