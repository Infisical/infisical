import { Knex } from "knex";

import { TableName } from "../schemas";

// The signer-revamp migration (20260528124443) created pki_signer_certificate_issuance_jobs with
// three FK columns; only signerId was indexed. Postgres does not auto-index FK columns, so a
// delete on the parent (certificate_authorities or certificates) fires a per-row RI trigger that
// seq-scans this table on every deleted parent row.
//
// - caId: notNullable, CASCADE FK to certificate_authorities. Every row participates, so a full
//   index is the right shape.
// - certificateId: nullable, SET NULL FK to certificates. Populated only after the issuance job
//   completes, so most in-flight rows are NULL. A partial WHERE ... IS NOT NULL index serves the
//   RI lookup at a fraction of the size and write cost of a full index.
//
// Built CONCURRENTLY so the deploy doesn't take a write-blocking lock on the table while each
// index is created — pattern mirrors 20260715060344_add-fk-indexes-pam-revamp.ts.
const FK_INDEXES = [
  {
    table: TableName.PkiSignerCertificateIssuanceJobs,
    column: "caId",
    name: "pki_signer_certificate_issuance_jobs_ca_id_idx",
    partial: false
  },
  {
    table: TableName.PkiSignerCertificateIssuanceJobs,
    column: "certificateId",
    name: "pki_signer_certificate_issuance_jobs_certificate_id_idx",
    partial: true
  }
];

const MIGRATION_TIMEOUT = 60 * 60 * 1000; // 60 minutes
const MIGRATION_LOCK_TIMEOUT = 30 * 1000; // 30 seconds

// An interrupted CREATE INDEX CONCURRENTLY (deploy cancel, statement_timeout, lost connection)
// leaves the index row in pg_class with indisvalid=false. A rerun with IF NOT EXISTS then no-ops,
// so the migration "succeeds" without producing a usable index. Drop any such invalid index
// before recreating.
const dropIfInvalid = async (knex: Knex, indexName: string): Promise<void> => {
  const result = await knex.raw(
    `SELECT 1 FROM pg_class c
     JOIN pg_index i ON i.indexrelid = c.oid
     WHERE c.relname = ? AND c.relkind = 'i' AND i.indisvalid = false`,
    [indexName]
  );
  if (result.rows.length > 0) {
    await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS "${indexName}"`);
  }
};

export async function up(knex: Knex): Promise<void> {
  const stmtResult = await knex.raw("SHOW statement_timeout");
  const originalStatementTimeout = stmtResult.rows[0].statement_timeout;
  const lockResult = await knex.raw("SHOW lock_timeout");
  const originalLockTimeout = lockResult.rows[0].lock_timeout;

  try {
    await knex.raw(`SET statement_timeout = ${MIGRATION_TIMEOUT}`);
    await knex.raw(`SET lock_timeout = ${MIGRATION_LOCK_TIMEOUT}`);

    for await (const idx of FK_INDEXES) {
      if ((await knex.schema.hasTable(idx.table)) && (await knex.schema.hasColumn(idx.table, idx.column))) {
        await dropIfInvalid(knex, idx.name);
        const predicate = idx.partial ? `WHERE "${idx.column}" IS NOT NULL` : "";
        await knex.raw(`
          CREATE INDEX CONCURRENTLY IF NOT EXISTS "${idx.name}"
          ON ${idx.table} ("${idx.column}")
          ${predicate}
        `);
      }
    }
  } finally {
    await knex.raw(`SET statement_timeout = '${originalStatementTimeout}'`);
    await knex.raw(`SET lock_timeout = '${originalLockTimeout}'`);
  }
}

export async function down(knex: Knex): Promise<void> {
  for await (const idx of FK_INDEXES) {
    await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS "${idx.name}"`);
  }
}

const config = { transaction: false };
export { config };
