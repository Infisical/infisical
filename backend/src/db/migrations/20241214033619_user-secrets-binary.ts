import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const isTablePresent = await knex.schema.hasTable(TableName.UserSecrets);
  if (isTablePresent) {
    await knex.schema.alterTable(TableName.UserSecrets, (t) => {
      // Secure Note
      t.binary("encryptedTitle").alter();
      t.binary("encryptedContent").alter();

      // Web Login
      t.binary("encryptedUsername").alter();
      t.binary("encryptedPassword").alter();

      // Credit Card
      t.binary("encryptedCardNumber").alter();
      t.binary("encryptedExpiryDate").alter();
      t.binary("encryptedCVV").alter();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.AuthTokens, "orgId")) {
    await knex.schema.alterTable(TableName.AuthTokens, (t) => {
      // Secure Note
      t.text("encryptedTitle").alter();
      t.text("encryptedContent").alter();

      // Web Login
      t.text("encryptedUsername").alter();
      t.text("encryptedPassword").alter();

      // Credit Card
      t.text("encryptedCardNumber").alter();
      t.text("encryptedExpiryDate").alter();
      t.text("encryptedCVV").alter();
    });
  }
}
