import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasPayloadCol = await knex.schema.hasColumn(TableName.AuthTokens, "payload");

  if (!hasPayloadCol) {
    await knex.schema.alterTable(TableName.AuthTokens, (t) => {
      t.text("payload").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasPayloadCol = await knex.schema.hasColumn(TableName.AuthTokens, "payload");

  if (hasPayloadCol) {
    await knex.schema.alterTable(TableName.AuthTokens, (t) => {
      t.dropColumn("payload");
    });
  }
}
