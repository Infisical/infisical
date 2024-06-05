import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.SecretSharing)) {
    await knex.schema.alterTable(TableName.SecretSharing, (t) => {
      t.uuid("orgId").nullable().alter();
      t.uuid("userId").nullable().alter();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.SecretSharing)) {
    await knex.schema.alterTable(TableName.SecretSharing, (t) => {
      t.uuid("orgId").notNullable().alter();
      t.uuid("userId").notNullable().alter();
    });
  }
}
