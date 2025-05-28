import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.SecretSharing)) {
    const hasEncryptedSalt = await knex.schema.hasColumn(TableName.SecretSharing, "encryptedSalt");

    if (hasEncryptedSalt) {
      await knex.schema.alterTable(TableName.SecretSharing, (t) => {
        t.dropColumn("encryptedSalt");
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.SecretSharing)) {
    const hasEncryptedSalt = await knex.schema.hasColumn(TableName.SecretSharing, "encryptedSalt");

    if (!hasEncryptedSalt) {
      await knex.schema.alterTable(TableName.SecretSharing, (t) => {
        t.binary("encryptedSalt").nullable();
      });
    }
  }
}
