import { Knex } from "knex";

import { inMemoryKeyStore } from "@app/keystore/memory";
import { initLogger } from "@app/lib/logger";
import { kmsRootConfigDALFactory } from "@app/services/kms/kms-root-config-dal";
import { generateRecoveryCode } from "@app/services/mfa-recovery-code/mfa-recovery-code-fns";
import { superAdminDALFactory } from "@app/services/super-admin/super-admin-dal";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";
import { getMigrationEnvConfig, getMigrationHsmConfig } from "./utils/env-config";
import { getMigrationEncryptionServices, getMigrationHsmService } from "./utils/services";

const BATCH_SIZE = 500;
// Keep in sync with MAX_RECOVERY_CODE_LIMIT in mfa-recovery-code-service.ts.
const RECOVERY_CODE_COUNT = 10;

// Boots just enough of the KMS stack to mint root-key ciphertext from within a
// migration, mirroring the runtime mfaRecoveryCodeService.
const startRootEncryptor = async (knex: Knex) => {
  initLogger();
  const { hsmService } = await getMigrationHsmService({ envConfig: getMigrationHsmConfig() });
  const superAdminDAL = superAdminDALFactory(knex);
  const kmsRootConfigDAL = kmsRootConfigDALFactory(knex);
  const envConfig = await getMigrationEnvConfig(superAdminDAL, hsmService, kmsRootConfigDAL);
  const keyStore = inMemoryKeyStore();
  const { kmsService } = await getMigrationEncryptionServices({ envConfig, keyStore, db: knex });
  return kmsService.encryptWithRootKey();
};

// Same code count + encoding as generateEncryptedRecoveryCodes in the service,
// so the ciphertext decrypts identically in either store.
const generateEncryptedRecoveryCodes = (encryptWithRoot: (plainText: Buffer) => Buffer) => {
  const recoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }).map(generateRecoveryCode);
  return encryptWithRoot(Buffer.from(recoveryCodes.join(",")));
};

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

  // Some MFA-enabled users have no pool after the copy above: email-MFA users
  // (no TOTP config at all) and users whose TOTP config was never verified.
  // Going forward the disabled->enabled transition mints codes, but these
  // pre-existing users would be stuck (unable to finish org-enforced enrollment
  // or use recovery-code login), so generate a fresh pool for them.
  const usersMissingRecoveryCodes = await knex(TableName.Users)
    .leftJoin(TableName.UserMfaRecoveryCode, `${TableName.UserMfaRecoveryCode}.userId`, `${TableName.Users}.id`)
    .where(`${TableName.Users}.isMfaEnabled`, true)
    .whereNull(`${TableName.UserMfaRecoveryCode}.id`)
    .select(`${TableName.Users}.id`);

  if (usersMissingRecoveryCodes.length) {
    const encryptWithRoot = await startRootEncryptor(knex);
    const rows = usersMissingRecoveryCodes.map(({ id }) => ({
      userId: id,
      encryptedRecoveryCodes: generateEncryptedRecoveryCodes(encryptWithRoot)
    }));

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      // eslint-disable-next-line no-await-in-loop
      await knex(TableName.UserMfaRecoveryCode)
        .insert(rows.slice(i, i + BATCH_SIZE))
        .onConflict("userId")
        .ignore();
    }
  }

  // Recovery codes now live in user_mfa_recovery_codes. The values were copied
  // above, but we intentionally KEEP the legacy totp_configs column and only
  // relax its NOT NULL constraint rather than dropping it. During a rolling
  // deploy the previous backend version is still serving and reads this column
  // unconditionally (getUserTotpConfig / registerUserTotp / verifyUserTotpConfig
  // and the recovery-code login path); dropping it would 500 those pods for
  // every TOTP operation until they roll. Making it nullable lets the new code
  // insert TOTP configs without it while the old code keeps reading the existing
  // ciphertext. A follow-up migration can drop the column once every pod runs
  // the new code.
  if (await knex.schema.hasColumn(TableName.TotpConfig, "encryptedRecoveryCodes")) {
    await knex.schema.alterTable(TableName.TotpConfig, (t) => {
      t.binary("encryptedRecoveryCodes").nullable().alter();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  // The `up` kept the legacy column (nullable), so it should already exist. Guard
  // against a missing column defensively; the original NOT NULL constraint is
  // restored at the end.
  if (!(await knex.schema.hasColumn(TableName.TotpConfig, "encryptedRecoveryCodes"))) {
    await knex.schema.alterTable(TableName.TotpConfig, (t) => {
      t.binary("encryptedRecoveryCodes").nullable();
    });
  }

  if (await knex.schema.hasTable(TableName.UserMfaRecoveryCode)) {
    // Copy the account-level recovery codes back into the legacy column so the
    // user's currently-valid codes (which may have been rotated after the up ran)
    // keep working under the rolled-back code. Both stores share the same
    // root-key ciphertext, so it is portable.
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

  // TOTP configs created by the new code (or whose account-level pool was missing)
  // still have NULL. The pre-migration TOTP code decrypts this column
  // unconditionally and the original schema was NOT NULL, so mint a fresh pool for
  // those rows before restoring the constraint. Otherwise the rolled-back code
  // throws a 500 on every TOTP settings load / login for those users.
  const totpConfigsMissingCodes = await knex(TableName.TotpConfig).whereNull("encryptedRecoveryCodes").select("id");

  if (totpConfigsMissingCodes.length) {
    const encryptWithRoot = await startRootEncryptor(knex);

    for (const { id } of totpConfigsMissingCodes) {
      // Raw update: encryptedRecoveryCodes is not part of the generated totp_configs
      // schema, so the typed query builder does not know the column.
      // eslint-disable-next-line no-await-in-loop
      await knex.raw(`UPDATE ?? SET "encryptedRecoveryCodes" = ? WHERE "id" = ?`, [
        TableName.TotpConfig,
        generateEncryptedRecoveryCodes(encryptWithRoot),
        id
      ]);
    }
  }

  // Restore the original NOT NULL constraint now that every row has ciphertext.
  if (await knex.schema.hasColumn(TableName.TotpConfig, "encryptedRecoveryCodes")) {
    await knex.schema.alterTable(TableName.TotpConfig, (t) => {
      t.binary("encryptedRecoveryCodes").notNullable().alter();
    });
  }
}
