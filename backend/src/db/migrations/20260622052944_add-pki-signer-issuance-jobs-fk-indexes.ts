import { Knex } from "knex";

import { TableName } from "../schemas";

// pki_signer_certificate_issuance_jobs.caId (CASCADE FK to certificate_authorities) and
// certificateId (SET NULL FK to certificates) ship without covering indexes, so the per-row
// RI triggers fall back to a seq-scan of this table on every parent CA / certificate delete.
// certificateId is nullable (created later by the issuance worker), so it gets a partial index
// that skips the NULL rows.
const FK_INDEXES = [
  {
    table: TableName.PkiSignerCertificateIssuanceJobs,
    column: "caId",
    name: "pki_signer_certificate_issuance_jobs_caid_idx",
    partial: false
  },
  {
    table: TableName.PkiSignerCertificateIssuanceJobs,
    column: "certificateId",
    name: "pki_signer_certificate_issuance_jobs_certificateid_idx",
    partial: true
  }
];

const indexExists = async (knex: Knex, indexName: string): Promise<boolean> => {
  const result = await knex.raw(`SELECT 1 FROM pg_indexes WHERE indexname = ?`, [indexName]);
  return result.rows.length > 0;
};

export async function up(knex: Knex): Promise<void> {
  for await (const idx of FK_INDEXES) {
    if (
      (await knex.schema.hasTable(idx.table)) &&
      (await knex.schema.hasColumn(idx.table, idx.column)) &&
      !(await indexExists(knex, idx.name))
    ) {
      await knex.schema.alterTable(idx.table, (t) => {
        if (idx.partial) {
          t.index([idx.column], idx.name, { predicate: knex.whereNotNull(idx.column) });
        } else {
          t.index([idx.column], idx.name);
        }
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  for await (const idx of FK_INDEXES) {
    if ((await knex.schema.hasTable(idx.table)) && (await indexExists(knex, idx.name))) {
      await knex.schema.alterTable(idx.table, (t) => {
        t.dropIndex([idx.column], idx.name);
      });
    }
  }
}
