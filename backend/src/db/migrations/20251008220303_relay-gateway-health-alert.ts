import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.Relay, "healthAlertedAt"))) {
    await knex.schema.alterTable(TableName.Relay, (t) => {
      t.datetime("healthAlertedAt");
    });
  }
  if (!(await knex.schema.hasColumn(TableName.GatewayV2, "healthAlertedAt"))) {
    await knex.schema.alterTable(TableName.GatewayV2, (t) => {
      t.datetime("healthAlertedAt");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.GatewayV2, "healthAlertedAt")) {
    await knex.schema.alterTable(TableName.GatewayV2, (t) => {
      t.dropColumn("healthAlertedAt");
    });
  }
  if (await knex.schema.hasColumn(TableName.Relay, "healthAlertedAt")) {
    await knex.schema.alterTable(TableName.Relay, (t) => {
      t.dropColumn("healthAlertedAt");
    });
  }
}
