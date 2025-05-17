import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.SecretSharing)) {
    const hasEncryptedSalt = await knex.schema.hasColumn(TableName.SecretSharing, "encryptedSalt");
    const hasAuthorizedEmails = await knex.schema.hasColumn(TableName.SecretSharing, "authorizedEmails");

    if (!hasEncryptedSalt || !hasAuthorizedEmails) {
      await knex.schema.alterTable(TableName.SecretSharing, (t) => {
        // These two columns are only needed when secrets are shared with a specific list of emails

        if (!hasEncryptedSalt) {
          t.binary("encryptedSalt").nullable();
        }

        if (!hasAuthorizedEmails) {
          t.json("authorizedEmails").nullable();
        }
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.SecretSharing)) {
    const hasEncryptedSalt = await knex.schema.hasColumn(TableName.SecretSharing, "encryptedSalt");
    const hasAuthorizedEmails = await knex.schema.hasColumn(TableName.SecretSharing, "authorizedEmails");

    if (hasEncryptedSalt || hasAuthorizedEmails) {
      await knex.schema.alterTable(TableName.SecretSharing, (t) => {
        if (hasEncryptedSalt) {
          t.dropColumn("encryptedSalt");
        }

        if (hasAuthorizedEmails) {
          t.dropColumn("authorizedEmails");
        }
      });
    }
  }
}
