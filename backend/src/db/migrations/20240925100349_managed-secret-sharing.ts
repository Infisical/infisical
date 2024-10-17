import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.SecretSharing)) {
    const hasEncryptedSecret = await knex.schema.hasColumn(TableName.SecretSharing, "encryptedSecret");
    const hasIdentifier = await knex.schema.hasColumn(TableName.SecretSharing, "identifier");

    await knex.schema.alterTable(TableName.SecretSharing, (t) => {
      t.string("iv").nullable().alter();
      t.string("tag").nullable().alter();
      t.string("encryptedValue").nullable().alter();

      if (!hasEncryptedSecret) {
        t.binary("encryptedSecret").nullable();
      }
      t.string("hashedHex").nullable().alter();

      if (!hasIdentifier) {
        t.string("identifier", 64).nullable();
        t.unique("identifier");
        t.index("identifier");
      }
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasEncryptedSecret = await knex.schema.hasColumn(TableName.SecretSharing, "encryptedSecret");
  const hasIdentifier = await knex.schema.hasColumn(TableName.SecretSharing, "identifier");
  if (await knex.schema.hasTable(TableName.SecretSharing)) {
    await knex.schema.alterTable(TableName.SecretSharing, (t) => {
      if (hasEncryptedSecret) {
        t.dropColumn("encryptedSecret");
      }

      if (hasIdentifier) {
        t.dropColumn("identifier");
      }
    });
  }
}
