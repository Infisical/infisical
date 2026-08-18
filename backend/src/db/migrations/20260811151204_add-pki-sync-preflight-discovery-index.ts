import { Knex } from "knex";

import { TableName } from "../schemas";

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
