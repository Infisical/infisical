import { Knex } from "knex";

import { TableName } from "../schemas";

// The pam-revamp migration (20260612142201) added six nullable FK columns without covering
// indexes. Postgres does not auto-index FK columns, so a delete on any parent (gateways_v2,
// gateway_pools, app_connections) fires a per-row referential-integrity trigger that
// seq-scans the child table on every row.
//
// All six are nullable and expected to be mostly NULL (they only carry a value when the
// account/template overrides the default gateway/pool or opts into a recording connection),
// so a partial `WHERE col IS NOT NULL` index is the right shape: it serves the RI lookup
// at a fraction of the size and write cost of a full index.
//
// Built CONCURRENTLY so the deploy doesn't take a write-blocking lock on production
// pam_accounts / pam_account_templates while each index is created — pattern mirrors
// 20260602100000_add-secret-versions-v2-envid-index.ts.
const FK_INDEXES = [
  {
    table: TableName.PamAccountTemplate,
    column: "gatewayId",
    name: "pam_account_templates_gateway_id_idx"
  },
  {
    table: TableName.PamAccountTemplate,
    column: "gatewayPoolId",
    name: "pam_account_templates_gateway_pool_id_idx"
  },
  {
    table: TableName.PamAccountTemplate,
    column: "recordingConnectionId",
    name: "pam_account_templates_recording_connection_id_idx"
  },
  {
    table: TableName.PamAccount,
    column: "gatewayId",
    name: "pam_accounts_gateway_id_idx"
  },
  {
    table: TableName.PamAccount,
    column: "gatewayPoolId",
    name: "pam_accounts_gateway_pool_id_idx"
  },
  {
    table: TableName.PamAccount,
    column: "recordingConnectionId",
    name: "pam_accounts_recording_connection_id_idx"
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
        await knex.raw(`
          CREATE INDEX CONCURRENTLY IF NOT EXISTS "${idx.name}"
          ON ${idx.table} ("${idx.column}")
          WHERE "${idx.column}" IS NOT NULL
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
