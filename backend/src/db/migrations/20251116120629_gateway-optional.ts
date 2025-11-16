import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.PamResource, "gatewayId")) {
    await knex.schema.alterTable(TableName.PamResource, (t) => {
      t.uuid("gatewayId").nullable().alter();
    });
  }
}

export async function down(): Promise<void> {
  // we can't make it back non nullable as it will fail
}
