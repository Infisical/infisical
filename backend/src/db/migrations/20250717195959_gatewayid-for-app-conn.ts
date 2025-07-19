import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.AppConnection, "gatewayId"))) {
    await knex.schema.alterTable(TableName.AppConnection, (t) => {
      t.uuid("gatewayId").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.AppConnection, "gatewayId")) {
    await knex.schema.alterTable(TableName.AppConnection, (t) => {
      t.dropColumn("gatewayId");
    });
  }
}
