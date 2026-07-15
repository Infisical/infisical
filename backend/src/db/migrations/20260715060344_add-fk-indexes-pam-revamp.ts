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
        t.index([idx.column], idx.name, { predicate: knex.whereNotNull(idx.column) });
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
