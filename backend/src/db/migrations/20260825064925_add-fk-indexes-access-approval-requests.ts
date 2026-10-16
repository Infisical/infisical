import { Knex } from "knex";

import { TableName } from "../schemas";

// access_approval_requests and access_approval_requests_reviewers were created without covering
// indexes for any of their FK columns. Postgres does not auto-index FK columns, so every parent
// DELETE (a user is removed, a policy is dropped, a privilege is cascaded, an access request is
// cleaned up) fires a per-row RI trigger that seq-scans these tables — cheap today, but grows
// linearly with request/reviewer volume.
//
// - policyId (CASCADE, notNullable): every row participates → full index.
// - privilegeId (CASCADE/SET NULL, nullable): populated only after approval creates the actual
//   privilege → partial WHERE ... IS NOT NULL index.
// - requestedByUserId (CASCADE/SET NULL, notNullable): every row participates → full index.
// - approvedByUserId (SET NULL, nullable): populated only after approval → partial index.
// - revokedByUserId (SET NULL, nullable): populated only after revocation → partial index.
// - editedByUserId (SET NULL, nullable): populated only when a reviewer edits a request → partial index.
// - requestId (CASCADE, notNullable): every reviewer row participates → full index.
// - reviewerUserId (SET NULL, notNullable): every reviewer row participates → full index.
//
// Built CONCURRENTLY so the deploy doesn't take a write-blocking lock, including an invalid-index
// rebuild guard for interrupted concurrent builds.
const FK_INDEXES = [
  {
    table: TableName.AccessApprovalRequest,
    column: "policyId",
    name: "access_approval_requests_policy_id_idx",
    partial: false
  },
  {
    table: TableName.AccessApprovalRequest,
    column: "privilegeId",
    name: "access_approval_requests_privilege_id_idx",
    partial: true
  },
  {
    table: TableName.AccessApprovalRequest,
    column: "requestedByUserId",
    name: "access_approval_requests_requested_by_user_id_idx",
    partial: false
  },
  {
    table: TableName.AccessApprovalRequest,
    column: "approvedByUserId",
    name: "access_approval_requests_approved_by_user_id_idx",
    partial: true
  },
  {
    table: TableName.AccessApprovalRequest,
    column: "revokedByUserId",
    name: "access_approval_requests_revoked_by_user_id_idx",
    partial: true
  },
  {
    table: TableName.AccessApprovalRequest,
    column: "editedByUserId",
    name: "access_approval_requests_edited_by_user_id_idx",
    partial: true
  },
  {
    table: TableName.AccessApprovalRequestReviewer,
    column: "requestId",
    name: "access_approval_requests_reviewers_request_id_idx",
    partial: false
  },
  {
    table: TableName.AccessApprovalRequestReviewer,
    column: "reviewerUserId",
    name: "access_approval_requests_reviewers_reviewer_user_id_idx",
    partial: false
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
