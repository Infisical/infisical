import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable(TableName.UserEncryptionKey, (table) => {
    table.text("encryptedPrivateKey").nullable().alter();
    table.text("publicKey").nullable().alter();
    table.text("iv").nullable().alter();
    table.text("tag").nullable().alter();
    table.text("salt").nullable().alter();
    table.text("verifier").nullable().alter();
  });
}

export async function down(knex: Knex): Promise<void> {
  // do nothing for now to avoid breaking down migrations
}
