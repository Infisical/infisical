/**
 * TDLR: Add a migration to call internalKmsKeyVersionDAL.create for all current
 * internalKmsDAL.get(internalKms.id) versions. The current internalKms version
 * was not present in internalKmsKeyVersion; internalKmsKeyVersionDAL now stores
 * future versions, whereas before this migration it was used explicitly for
 * archivals.
 */
import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    INSERT INTO "${TableName.InternalKmsKeyVersion}" (
      "id",
      "encryptedKey",
      "version",
      "internalKmsId",
      "origin"
    )
    SELECT
      gen_random_uuid(),
      internal_kms."encryptedKey",
      internal_kms."version",
      internal_kms."id",
      internal_kms."origin"
    FROM "${TableName.InternalKms}" AS internal_kms
    ON CONFLICT ("internalKmsId", "version") DO NOTHING
  `);
}

export async function down(): Promise<void> {
  // This data migration is intentionally irreversible.
}
