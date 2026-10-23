import { Knex } from "knex";

import { TableName } from "@app/db/schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.HoneyToken, "hosting"))) {
    await knex.schema.alterTable(TableName.HoneyToken, (t) => {
      // Every token created before this column existed lives in the customer's own AWS account.
      t.string("hosting", 32).notNullable().defaultTo("customer-account");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.HoneyToken, "hosting")) {
    await knex.schema.alterTable(TableName.HoneyToken, (t) => {
      t.dropColumn("hosting");
    });
  }
}
