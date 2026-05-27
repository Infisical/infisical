import { Knex } from "knex";

import { TableName } from "@app/db/schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.AppConnection, "encryptedConfiguration"))) {
    await knex.schema.alterTable(TableName.AppConnection, (t) => {
      t.binary("encryptedConfiguration").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.AppConnection, "encryptedConfiguration")) {
    await knex.schema.alterTable(TableName.AppConnection, (t) => {
      t.dropColumn("encryptedConfiguration");
    });
  }
}
