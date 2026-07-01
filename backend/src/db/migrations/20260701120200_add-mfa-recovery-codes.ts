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

  // Recovery codes now live in user_mfa_recovery_codes; TOTP no longer writes
  // this column. Make it nullable so new TOTP configs can omit it. A follow-up
  // migration can drop the column entirely.
  if (await knex.schema.hasColumn(TableName.TotpConfig, "encryptedRecoveryCodes")) {
    await knex.schema.alterTable(TableName.TotpConfig, (t) => {
      t.binary("encryptedRecoveryCodes").nullable().alter();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  // Re-populate the TOTP column from the account-level store before restoring
  // the NOT NULL constraint so rollback does not fail on existing rows.
  if (await knex.schema.hasTable(TableName.UserMfaRecoveryCode)) {
    await knex.raw(
      `UPDATE ?? tc
       SET "encryptedRecoveryCodes" = rc."encryptedRecoveryCodes"
       FROM ?? rc
       WHERE tc."userId" = rc."userId" AND tc."encryptedRecoveryCodes" IS NULL`,
      [TableName.TotpConfig, TableName.UserMfaRecoveryCode]
    );
  }

  if (await knex.schema.hasColumn(TableName.TotpConfig, "encryptedRecoveryCodes")) {
    await knex.schema.alterTable(TableName.TotpConfig, (t) => {
      t.binary("encryptedRecoveryCodes").notNullable().alter();
    });
  }

  if (await knex.schema.hasTable(TableName.UserMfaRecoveryCode)) {
    await dropOnUpdateTrigger(knex, TableName.UserMfaRecoveryCode);
    await knex.schema.dropTable(TableName.UserMfaRecoveryCode);
  }
}
