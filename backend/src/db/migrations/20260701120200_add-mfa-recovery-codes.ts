import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.UserMfaRecoveryCode))) {
    await knex.schema.createTable(TableName.UserMfaRecoveryCode, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("userId").notNullable();
      t.foreign("userId").references("id").inTable(TableName.Users).onDelete("CASCADE");
      t.binary("encryptedRecoveryCodes").notNullable();
      t.timestamps(true, true, true);
      // One account-level recovery-code pool per user. The unique constraint
      // also serves as the index for the userId foreign key.
      t.unique("userId");
    });

    await createOnUpdateTrigger(knex, TableName.UserMfaRecoveryCode);

    // Backfill from existing TOTP recovery codes. Both stores use
    // kmsService.encryptWithRootKey() (root-key AES-GCM, table-independent),
    // so the ciphertext is portable and can be copied without decrypting.
    await knex.raw(
      `INSERT INTO ?? ("userId", "encryptedRecoveryCodes")
       SELECT "userId", "encryptedRecoveryCodes"
       FROM ??
       WHERE "isVerified" = true
       ON CONFLICT ("userId") DO NOTHING`,
      [TableName.UserMfaRecoveryCode, TableName.TotpConfig]
    );
  }

  // Recovery codes now live in user_mfa_recovery_codes. The values were copied
  // above, so drop the legacy column from totp_configs.
  if (await knex.schema.hasColumn(TableName.TotpConfig, "encryptedRecoveryCodes")) {
    await knex.schema.alterTable(TableName.TotpConfig, (t) => {
      t.dropColumn("encryptedRecoveryCodes");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  // Recreate the legacy column so the pre-migration TOTP code can read recovery
  // codes again. It is nullable because TOTP configs created after the column
  // was dropped have no ciphertext to restore (their codes only live in the
  // account-level store, which may have no row for a given user).
  if (!(await knex.schema.hasColumn(TableName.TotpConfig, "encryptedRecoveryCodes"))) {
    await knex.schema.alterTable(TableName.TotpConfig, (t) => {
      t.binary("encryptedRecoveryCodes").nullable();
    });
  }

  if (await knex.schema.hasTable(TableName.UserMfaRecoveryCode)) {
    // Copy the account-level recovery codes back into the freshly recreated
    // column. Both stores share the same root-key ciphertext, so it is portable.
    await knex.raw(
      `UPDATE ?? tc
       SET "encryptedRecoveryCodes" = rc."encryptedRecoveryCodes"
       FROM ?? rc
       WHERE tc."userId" = rc."userId"`,
      [TableName.TotpConfig, TableName.UserMfaRecoveryCode]
    );

    await dropOnUpdateTrigger(knex, TableName.UserMfaRecoveryCode);
    await knex.schema.dropTable(TableName.UserMfaRecoveryCode);
  }
}
