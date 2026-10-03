import { Knex } from "knex";

import { TableName } from "../schemas";

// Two nullable FK columns from gateway-related migrations shipped without covering indexes,
// so the per-row referential-integrity trigger seq-scans the child table on every parent delete.
//
// - dynamic_secrets.gatewayPoolId  (RESTRICT to gateway_pools, nullable)
//   Set only when a dynamic secret is pinned to a pool. Most rows are NULL → partial index.
//
// - pam_sessions.gatewayId  (SET NULL to gateways_v2, nullable)
//   Set when a pool-backed PAM session resolves to a specific gateway. Most rows are NULL → partial index.
const FK_INDEXES = [
  {
    table: TableName.DynamicSecret,
    column: "gatewayPoolId",
    name: "dynamic_secrets_gateway_pool_id_idx"
  },
  {
    table: TableName.PamSession,
    column: "gatewayId",
    name: "pam_sessions_gateway_id_idx"
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
