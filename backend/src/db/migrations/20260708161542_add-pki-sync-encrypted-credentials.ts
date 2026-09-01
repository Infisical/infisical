import { Knex } from "knex";

import { TableName } from "@app/db/schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.PkiSync, "encryptedCredentials"))) {
    await knex.schema.alterTable(TableName.PkiSync, (t) => {
      t.binary("encryptedCredentials").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.PkiSync, "encryptedCredentials")) {
    await knex.schema.alterTable(TableName.PkiSync, (t) => {
      t.dropColumn("encryptedCredentials");
    });
  }
}
