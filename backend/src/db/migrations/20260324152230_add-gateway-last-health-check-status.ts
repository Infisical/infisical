import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.GatewayV2, "lastHealthCheckStatus"))) {
    await knex.schema.alterTable(TableName.GatewayV2, (t) => {
      t.string("lastHealthCheckStatus").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.GatewayV2, "lastHealthCheckStatus")) {
    await knex.schema.alterTable(TableName.GatewayV2, (t) => {
      t.dropColumn("lastHealthCheckStatus");
    });
  }
}
