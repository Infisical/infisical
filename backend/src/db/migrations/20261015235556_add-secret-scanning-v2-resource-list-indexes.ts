import { Knex } from "knex";

import { SecretScanningFindingStatus } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";

import { TableName } from "../schemas";

// Back the per-resource lookups of the resources list, which run for every resource of a data source before the
// list can be sorted by status or last scan.
const INDEXES = [
  {
    name: "secret_scanning_scans_resourceid_createdat_index",
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS secret_scanning_scans_resourceid_createdat_index
          ON ${TableName.SecretScanningScan} ("resourceId", "createdAt" DESC)`
  },
  {
    name: "secret_scanning_findings_resourceid_unresolved_index",
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS secret_scanning_findings_resourceid_unresolved_index
          ON ${TableName.SecretScanningFinding} ("resourceId") WHERE status = '${SecretScanningFindingStatus.Unresolved}'`
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
