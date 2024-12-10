import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.SshCertificateAuthority))) {
    await knex.schema.createTable(TableName.SshCertificateAuthority, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.timestamps(true, true, true);
      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.string("status").notNullable(); // active / disabled
      t.string("friendlyName").notNullable();
      t.string("keyAlgorithm").notNullable();
    });
    await createOnUpdateTrigger(knex, TableName.SshCertificateAuthority);
  }

  if (!(await knex.schema.hasTable(TableName.SshCertificateAuthoritySecret))) {
    await knex.schema.createTable(TableName.SshCertificateAuthoritySecret, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.timestamps(true, true, true);
      t.uuid("sshCaId").notNullable().unique();
      t.foreign("sshCaId").references("id").inTable(TableName.SshCertificateAuthority).onDelete("CASCADE");
      t.binary("encryptedPrivateKey").notNullable();
    });
    await createOnUpdateTrigger(knex, TableName.SshCertificateAuthoritySecret);
  }

  if (!(await knex.schema.hasTable(TableName.SshCertificateTemplate))) {
    await knex.schema.createTable(TableName.SshCertificateTemplate, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.timestamps(true, true, true);
      t.uuid("sshCaId").notNullable();
      t.foreign("sshCaId").references("id").inTable(TableName.SshCertificateAuthority).onDelete("CASCADE");
      t.string("status").notNullable(); // active / disabled
      t.string("name").notNullable();
      t.string("ttl").notNullable();
      t.string("maxTTL").notNullable();
      t.specificType("allowedUsers", "text[]").notNullable();
      t.specificType("allowedHosts", "text[]").notNullable();
      t.boolean("allowUserCertificates").notNullable();
      t.boolean("allowHostCertificates").notNullable();
      t.boolean("allowCustomKeyIds").notNullable();
    });
    await createOnUpdateTrigger(knex, TableName.SshCertificateTemplate);
  }

  if (!(await knex.schema.hasTable(TableName.SshCertificate))) {
    await knex.schema.createTable(TableName.SshCertificate, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.timestamps(true, true, true);
      t.uuid("sshCaId").notNullable();
      t.foreign("sshCaId").references("id").inTable(TableName.SshCertificateAuthority).onDelete("SET NULL");
      t.uuid("sshCertificateTemplateId");
      t.foreign("sshCertificateTemplateId")
        .references("id")
        .inTable(TableName.SshCertificateTemplate)
        .onDelete("SET NULL");
      t.string("serialNumber").notNullable().unique();
      t.string("certType").notNullable(); // user or host
      t.specificType("principals", "text[]").notNullable();
      t.string("keyId").notNullable();
      t.datetime("notBefore").notNullable();
      t.datetime("notAfter").notNullable();
    });
    await createOnUpdateTrigger(knex, TableName.SshCertificate);
  }

  if (!(await knex.schema.hasTable(TableName.SshCertificateBody))) {
    await knex.schema.createTable(TableName.SshCertificateBody, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.timestamps(true, true, true);
      t.uuid("sshCertId").notNullable().unique();
      t.foreign("sshCertId").references("id").inTable(TableName.SshCertificate).onDelete("CASCADE");
      t.binary("encryptedCertificate").notNullable();
    });

    await createOnUpdateTrigger(knex, TableName.SshCertificateBody);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.SshCertificateBody);
  await dropOnUpdateTrigger(knex, TableName.SshCertificateBody);

  await knex.schema.dropTableIfExists(TableName.SshCertificate);
  await dropOnUpdateTrigger(knex, TableName.SshCertificate);

  await knex.schema.dropTableIfExists(TableName.SshCertificateTemplate);
  await dropOnUpdateTrigger(knex, TableName.SshCertificateTemplate);

  await knex.schema.dropTableIfExists(TableName.SshCertificateAuthoritySecret);
  await dropOnUpdateTrigger(knex, TableName.SshCertificateAuthoritySecret);

  await knex.schema.dropTableIfExists(TableName.SshCertificateAuthority);
  await dropOnUpdateTrigger(knex, TableName.SshCertificateAuthority);
}
