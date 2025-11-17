import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasPamResourceTable = await knex.schema.hasTable(TableName.PamResource);
  const hasGatewayField = await knex.schema.hasColumn(TableName.PamResource, "gatewayId");
  if (hasPamResourceTable && !hasGatewayField) {
    await knex.schema.alterTable(TableName.PamResource, (t) => {
      t.uuid("gatewayId").nullable().alter();
    });
  }

  const hasPamAccountTable = await knex.schema.hasTable(TableName.PamAccount);
  const hasConfigField = await knex.schema.hasColumn(TableName.PamAccount, "config");
  console.log(hasPamAccountTable, hasConfigField);
  if (hasPamAccountTable && !hasConfigField) {
    await knex.schema.alterTable(TableName.PamAccount, (t) => {
      t.jsonb("config").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  // we can't make it back non nullable as it will fail
  const hasPamAccountTable = await knex.schema.hasTable(TableName.PamAccount);
  const hasConfigField = await knex.schema.hasColumn(TableName.PamAccount, "config");
  if (hasPamAccountTable && hasConfigField) {
    await knex.schema.alterTable(TableName.PamAccount, (t) => {
      t.dropColumn("config");
    });
  }
}
