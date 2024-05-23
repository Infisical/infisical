import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.CertificateAuthority))) {
    // TODO: consider adding algo details
    await knex.schema.createTable(TableName.CertificateAuthority, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.timestamps(true, true, true);
      t.uuid("parentCaId").nullable();
      t.foreign("parentCaId").references("id").inTable(TableName.CertificateAuthority).onDelete("CASCADE");
      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.string("type").notNullable(); // root / intermediate
      t.string("dn").notNullable();
    });
  }

  if (!(await knex.schema.hasTable(TableName.CertificateAuthorityCert))) {
    await knex.schema.createTable(TableName.CertificateAuthorityCert, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.timestamps(true, true, true);
      t.uuid("caId").notNullable().unique(); // TODO: consider that cert can be rotated so may be multiple / non-unique
      t.foreign("caId").references("id").inTable(TableName.CertificateAuthority).onDelete("CASCADE");
      t.text("certificate").notNullable(); // TODO: encrypt
      t.text("certificateChain").notNullable(); // TODO: encrypt
    });
  }

  // TODO: consider renaming this to CertificateAuthoritySecret
  if (!(await knex.schema.hasTable(TableName.CertificateAuthoritySk))) {
    await knex.schema.createTable(TableName.CertificateAuthoritySk, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.timestamps(true, true, true);
      t.uuid("caId").notNullable().unique();
      t.foreign("caId").references("id").inTable(TableName.CertificateAuthority).onDelete("CASCADE");
      t.text("pk").notNullable(); // TODO: encrypt
      t.text("sk").notNullable(); // TODO: encrypt
    });
  }

  await createOnUpdateTrigger(knex, TableName.CertificateAuthority);
  await createOnUpdateTrigger(knex, TableName.CertificateAuthorityCert);
  await createOnUpdateTrigger(knex, TableName.CertificateAuthoritySk);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.CertificateAuthoritySk);
  await dropOnUpdateTrigger(knex, TableName.CertificateAuthoritySk);

  await knex.schema.dropTableIfExists(TableName.CertificateAuthorityCert);
  await dropOnUpdateTrigger(knex, TableName.CertificateAuthorityCert);

  await knex.schema.dropTableIfExists(TableName.CertificateAuthority);
  await dropOnUpdateTrigger(knex, TableName.CertificateAuthority);
}
