import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.SecretSharing)) {
    await knex.schema.alterTable(TableName.SecretSharing, (t) => {
      t.string("identifier", 36).nullable();

      t.unique("identifier");
      t.index("identifier");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.SecretSharing)) {
    await knex.schema.alterTable(TableName.SecretSharing, (t) => {
      // If rolled back, all secrets created with this new structure will stop working.
      t.dropColumn("identifier");
    });
  }
}
