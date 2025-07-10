import { Knex } from "knex";

import { TableName } from "../schemas";

const MIGRATION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

export async function up(knex: Knex): Promise<void> {
  const result = await knex.raw('SHOW statement_timeout');
  const originalTimeout = result.rows[0].statement_timeout;
  
  try {
    await knex.raw(`SET statement_timeout = ${MIGRATION_TIMEOUT}`);

    await knex.raw(`
          CREATE INDEX CONCURRENTLY IF NOT EXISTS ${TableName.IdentityAccessToken}_identityid_index 
          ON ${TableName.IdentityAccessToken} ("identityId")
        `);

    await knex.raw(`
          CREATE INDEX CONCURRENTLY IF NOT EXISTS ${TableName.IdentityAccessToken}_identityuaclientsecretid_index 
          ON ${TableName.IdentityAccessToken} ("identityUAClientSecretId")
        `);
  } finally {
    await knex.raw(`SET statement_timeout = '${originalTimeout}'`);
  }
}

export async function down(knex: Knex): Promise<void> {
  const result = await knex.raw('SHOW statement_timeout');
  const originalTimeout = result.rows[0].statement_timeout;
  
  try {
    await knex.raw(`SET statement_timeout = ${MIGRATION_TIMEOUT}`);

    await knex.raw(`
          DROP INDEX IF EXISTS ${TableName.IdentityAccessToken}_identityid_index
        `);

    await knex.raw(`
          DROP INDEX IF EXISTS ${TableName.IdentityAccessToken}_identityuaclientsecretid_index
        `);
  } finally {
    await knex.raw(`SET statement_timeout = '${originalTimeout}'`);
  }
}

export const config = { transaction: false };