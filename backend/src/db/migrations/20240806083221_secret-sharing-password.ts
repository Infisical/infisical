import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.SecretSharing)) {
    const doesPasswordExist = await knex.schema.hasColumn(TableName.SecretSharing, "password");
    if (!doesPasswordExist) {
      await knex.schema.alterTable(TableName.SecretSharing, (t) => {
        t.string("password").nullable();
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.SecretSharing)) {
    const doesPasswordExist = await knex.schema.hasColumn(TableName.SecretSharing, "password");
    if (doesPasswordExist) {
      await knex.schema.alterTable(TableName.SecretSharing, (t) => {
        t.dropColumn("password");
      });
    }
  }
}
