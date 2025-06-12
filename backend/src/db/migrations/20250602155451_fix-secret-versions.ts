/* eslint-disable no-await-in-loop */
import { Knex } from "knex";

import { chunkArray } from "@app/lib/fn";
import { selectAllTableCols } from "@app/lib/knex";
import { logger } from "@app/lib/logger";

import { SecretType, TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  logger.info("Starting secret version fix migration");

  // Get all shared secret IDs first to optimize versions query
  const secretIds = await knex(TableName.SecretV2)
    .where("type", SecretType.Shared)
    .select("id")
    .then((rows) => rows.map((row) => row.id));

  logger.info(`Found ${secretIds.length} shared secrets to process`);

  if (secretIds.length === 0) {
    logger.info("No shared secrets found");
    return;
  }

  const secretIdChunks = chunkArray(secretIds, 5000);

  for (let chunkIndex = 0; chunkIndex < secretIdChunks.length; chunkIndex += 1) {
    const currentSecretIds = secretIdChunks[chunkIndex];
    logger.info(`Processing chunk ${chunkIndex + 1} of ${secretIdChunks.length}`);

    // Get secrets and versions for current chunk
    const [sharedSecrets, allVersions] = await Promise.all([
      knex(TableName.SecretV2).whereIn("id", currentSecretIds).select(selectAllTableCols(TableName.SecretV2)),
      knex(TableName.SecretVersionV2).whereIn("secretId", currentSecretIds).select("secretId", "version")
    ]);

    const versionsBySecretId = new Map<string, number[]>();

    allVersions.forEach((v) => {
      const versions = versionsBySecretId.get(v.secretId);
      if (versions) {
        versions.push(v.version);
      } else {
        versionsBySecretId.set(v.secretId, [v.version]);
      }
    });

    const versionsToAdd = [];
    const secretsToUpdate = [];

    // Process each shared secret
    for (const secret of sharedSecrets) {
      const existingVersions = versionsBySecretId.get(secret.id) || [];

      if (existingVersions.length === 0) {
        // No versions exist - add current version
        versionsToAdd.push({
          secretId: secret.id,
          version: secret.version,
          key: secret.key,
          encryptedValue: secret.encryptedValue,
          encryptedComment: secret.encryptedComment,
          reminderNote: secret.reminderNote,
          reminderRepeatDays: secret.reminderRepeatDays,
          skipMultilineEncoding: secret.skipMultilineEncoding,
          metadata: secret.metadata,
          folderId: secret.folderId,
          actorType: "platform"
        });
      } else {
        const latestVersion = Math.max(...existingVersions);

        if (latestVersion !== secret.version) {
          // Latest version doesn't match - create new version and update secret
          const nextVersion = latestVersion + 1;

          versionsToAdd.push({
            secretId: secret.id,
            version: nextVersion,
            key: secret.key,
            encryptedValue: secret.encryptedValue,
            encryptedComment: secret.encryptedComment,
            reminderNote: secret.reminderNote,
            reminderRepeatDays: secret.reminderRepeatDays,
            skipMultilineEncoding: secret.skipMultilineEncoding,
            metadata: secret.metadata,
            folderId: secret.folderId,
            actorType: "platform"
          });

          secretsToUpdate.push({
            id: secret.id,
            newVersion: nextVersion
          });
        }
      }
    }

    logger.info(
      `Chunk ${chunkIndex + 1}: Adding ${versionsToAdd.length} versions, updating ${secretsToUpdate.length} secrets`
    );

    // Batch insert new versions
    if (versionsToAdd.length > 0) {
      const insertBatches = chunkArray(versionsToAdd, 9000);
      for (let i = 0; i < insertBatches.length; i += 1) {
        await knex.batchInsert(TableName.SecretVersionV2, insertBatches[i]);
      }
    }

    if (secretsToUpdate.length > 0) {
      const updateBatches = chunkArray(secretsToUpdate, 1000);

      for (const updateBatch of updateBatches) {
        const ids = updateBatch.map((u) => u.id);
        const versionCases = updateBatch.map((u) => `WHEN '${u.id}' THEN ${u.newVersion}`).join(" ");

        await knex.raw(
          `
            UPDATE ${TableName.SecretV2} 
            SET version = CASE id ${versionCases} END,
                "updatedAt" = NOW()
            WHERE id IN (${ids.map(() => "?").join(",")})
          `,
          ids
        );
      }
    }
  }

  logger.info("Secret version fix migration completed");
}

export async function down(): Promise<void> {
  logger.info("Rollback not implemented for secret version fix migration");
  // Note: Rolling back this migration would be complex and potentially destructive
  // as it would require tracking which version entries were added
}
