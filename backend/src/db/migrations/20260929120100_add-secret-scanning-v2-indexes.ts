import { Knex } from "knex";

import { TableName } from "../schemas";

const INDEXES = [
  {
    name: "secret_scanning_findings_resourceid_fingerprint_unique",
    sql: `CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS secret_scanning_findings_resourceid_fingerprint_unique
          ON ${TableName.SecretScanningFinding} ("resourceId", fingerprint)`
  },
  {
    name: "secret_scanning_data_sources_connectionid_index",
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS secret_scanning_data_sources_connectionid_index
          ON ${TableName.SecretScanningDataSource} ("connectionId")`
  },
  {
    name: "secret_scanning_scans_resourceid_index",
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS secret_scanning_scans_resourceid_index
          ON ${TableName.SecretScanningScan} ("resourceId")`
  },
  {
    name: "secret_scanning_scans_triggered_by_user_id_index",
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS secret_scanning_scans_triggered_by_user_id_index
          ON ${TableName.SecretScanningScan} ("triggeredByUserId") WHERE "triggeredByUserId" IS NOT NULL`
  },
  {
    name: "secret_scanning_findings_scanid_index",
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS secret_scanning_findings_scanid_index
          ON ${TableName.SecretScanningFinding} ("scanId")`
  },
  {
    name: "secret_scanning_findings_triaged_by_user_id_index",
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS secret_scanning_findings_triaged_by_user_id_index
          ON ${TableName.SecretScanningFinding} ("triagedByUserId") WHERE "triagedByUserId" IS NOT NULL`
  }
];

// A failed CREATE INDEX CONCURRENTLY leaves an INVALID index behind, which IF NOT EXISTS would then skip.
const dropIfInvalid = async (knex: Knex, name: string) => {
  const invalid = await knex.raw(
    `SELECT 1 FROM pg_class c JOIN pg_index i ON i.indexrelid = c.oid WHERE c.relname = ? AND NOT i.indisvalid`,
    [name]
  );
  if (invalid.rows.length > 0) {
    await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS ??`, [name]);
  }
};

export async function up(knex: Knex): Promise<void> {
  for (const { name, sql } of INDEXES) {
    // eslint-disable-next-line no-await-in-loop
    await dropIfInvalid(knex, name);
    // eslint-disable-next-line no-await-in-loop
    await knex.raw(sql);
  }
}

export async function down(knex: Knex): Promise<void> {
  for (const { name } of INDEXES) {
    // eslint-disable-next-line no-await-in-loop
    await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS ??`, [name]);
  }
}

// CONCURRENTLY requires running outside a transaction
const config = { transaction: false };
export { config };
