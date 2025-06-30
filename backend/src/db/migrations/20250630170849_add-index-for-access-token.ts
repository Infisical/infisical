import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS ${TableName.IdentityAccessToken}_identityid_index 
        ON ${TableName.IdentityAccessToken} ("identityId")
      `);

  await knex.raw(`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS ${TableName.IdentityAccessToken}_identityuaclientsecretid_index 
        ON ${TableName.IdentityAccessToken} ("identityUAClientSecretId")
      `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
        DROP INDEX IF EXISTS ${TableName.IdentityAccessToken}_identityid_index
      `);

  await knex.raw(`
        DROP INDEX IF EXISTS ${TableName.IdentityAccessToken}_identityuaclientsecretid_index
      `);
}

const config = { transaction: false };

export { config };
