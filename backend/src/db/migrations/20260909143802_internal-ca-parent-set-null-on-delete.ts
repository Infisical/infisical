import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.InternalCertificateAuthority))) return;

  await knex.schema.alterTable(TableName.InternalCertificateAuthority, (t) => {
    t.dropForeign(["parentCaId"]);
    t.foreign("parentCaId").references("id").inTable(TableName.CertificateAuthority).onDelete("SET NULL");
  });

  await knex(TableName.CertificateAuthority)
    .whereNotIn("id", knex(TableName.InternalCertificateAuthority).select("caId"))
    .whereNotIn("id", knex(TableName.ExternalCertificateAuthority).select("caId"))
    .whereNotIn("id", knex(TableName.PkiCertificateProfile).select("caId").whereNotNull("caId"))
    .delete();
}

export async function down(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.InternalCertificateAuthority))) return;

  await knex.schema.alterTable(TableName.InternalCertificateAuthority, (t) => {
    t.dropForeign(["parentCaId"]);
    t.foreign("parentCaId").references("id").inTable(TableName.CertificateAuthority).onDelete("CASCADE");
  });
}
