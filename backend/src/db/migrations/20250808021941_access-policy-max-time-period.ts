import { Knex } from "knex";

import { TableName } from "../schemas/models";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.AccessApprovalPolicy, "maxTimePeriod"))) {
    await knex.schema.alterTable(TableName.AccessApprovalPolicy, (t) => {
      t.string("maxTimePeriod").nullable(); // Ex: 1h - Null is permanent
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.AccessApprovalPolicy, "maxTimePeriod")) {
    await knex.schema.alterTable(TableName.AccessApprovalPolicy, (t) => {
      t.dropColumn("maxTimePeriod");
    });
  }
}
