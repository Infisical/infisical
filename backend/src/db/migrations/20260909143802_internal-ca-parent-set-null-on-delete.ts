import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.InternalCertificateAuthority))) return;

  await knex.schema.alterTable(TableName.InternalCertificateAuthority, (t) => {
    t.dropForeign(["parentCaId"]);
    t.foreign("parentCaId").references("id").inTable(TableName.CertificateAuthority).onDelete("SET NULL");
  });

  const whereOrphaned = (query: Knex.QueryBuilder) =>
    query
      .whereNotIn("id", knex(TableName.InternalCertificateAuthority).select("caId"))
      .whereNotIn("id", knex(TableName.ExternalCertificateAuthority).select("caId"));

  await knex(TableName.PkiCertificateProfile)
    .whereNotNull("caId")
    .whereIn("caId", whereOrphaned(knex(TableName.CertificateAuthority).select("id")))
    .update({
      caId: null,
      issuerType: "self-signed",
      enrollmentType: "api",
      estConfigId: null,
      acmeConfigId: null,
      scepConfigId: null
    });

  await whereOrphaned(knex(TableName.CertificateAuthority)).delete();
}

export async function down(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.InternalCertificateAuthority))) return;

  await knex.schema.alterTable(TableName.InternalCertificateAuthority, (t) => {
    t.dropForeign(["parentCaId"]);
    t.foreign("parentCaId").references("id").inTable(TableName.CertificateAuthority).onDelete("CASCADE");
  });
}
