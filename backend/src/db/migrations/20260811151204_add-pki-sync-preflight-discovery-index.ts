import { Knex } from "knex";

import { TableName } from "../schemas";

// The scheduled preflight check enumerates "syncs with a check configured", which is a jsonb
// predicate no ordinary index can serve. Without this the daily tick walks the whole table: measured
// on 1M syncs with 2000 opted in, the planner discarded 997k rows to find them (224ms, 15k buffers)
// and, having no statistics for a jsonb expression, mis-estimated the filter at 99.5% selectivity.
// Partial on the same predicate, so it stays proportional to the opted-in set rather than the table
// (64kB against a 96MB table in that test) and costs nothing on the write path for every other sync.
const PREFLIGHT_DISCOVERY_INDEX = "idx_pki_syncs_preflight_discovery";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS "${PREFLIGHT_DISCOVERY_INDEX}"
    ON ${TableName.PkiSync} ("createdAt")
    WHERE ("syncOptions" ->> 'preflightCommand') IS NOT NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS "${PREFLIGHT_DISCOVERY_INDEX}"`);
}
