import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  await knex.transaction(async (tx) => {
    await tx.schema.alterTable(TableName.IdentityAccessToken, (table) => {
      table.dropForeign("identityId");
    });
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.transaction(async (tx) => {
    await tx.schema.alterTable(TableName.IdentityAccessToken, (table) => {
      table.foreign("identityId").references("id").inTable(TableName.Identity);
    });
  });
}

const config = { transaction: false };
export { config };
