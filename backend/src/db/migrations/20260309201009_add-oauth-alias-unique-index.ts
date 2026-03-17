import { Knex } from "knex";

import { TableName } from "../schemas";

const INDEX_NAME = "user_aliases_oauth_externalid_aliastype_unique";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(
    `CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "${INDEX_NAME}" ON "${TableName.UserAliases}" ("externalId", "aliasType") WHERE "aliasType" IN ('google', 'github', 'gitlab')`
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS "${INDEX_NAME}"`);
}

const config = { transaction: false };
export { config };
