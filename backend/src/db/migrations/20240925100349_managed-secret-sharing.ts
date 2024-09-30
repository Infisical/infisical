import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.SecretSharing)) {
    await knex.schema.alterTable(TableName.SecretSharing, (t) => {
      t.string("iv").nullable().alter();
      t.string("tag").nullable().alter();
      t.string("encryptedValue").nullable().alter();

      t.binary("encryptedSecret").nullable();
      t.string("hashedHex").nullable().alter();

      t.string("identifier", 64).nullable();
      t.unique("identifier");
      t.index("identifier");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.SecretSharing)) {
    await knex.schema.alterTable(TableName.SecretSharing, (t) => {
      t.dropColumn("encryptedSecret");

      t.dropColumn("identifier");
    });
  }
}
