import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.ResourceAwsAuth, "stsEndpoint")) {
    await knex.schema.alterTable(TableName.ResourceAwsAuth, (t) => {
      t.dropColumn("stsEndpoint");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.ResourceAwsAuth, "stsEndpoint"))) {
    await knex.schema.alterTable(TableName.ResourceAwsAuth, (t) => {
      t.string("stsEndpoint").notNullable().defaultTo("https://sts.amazonaws.com/");
    });
  }
}
