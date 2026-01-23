import { Knex } from "knex";

import { TableName } from "@app/db/schemas/models";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.SecretApprovalRequestSecretV2)) {
    await knex.schema.alterTable(TableName.SecretApprovalRequestSecretV2, (t) => {
      t.boolean("skipMultilineEncoding").alter();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.SecretApprovalRequestSecretV2)) {
    await knex.schema.alterTable(TableName.SecretApprovalRequestSecretV2, (t) => {
      t.boolean("skipMultilineEncoding").defaultTo(false).alter();
    });
  }
}
