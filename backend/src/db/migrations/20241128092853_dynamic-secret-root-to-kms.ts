import { Knex } from "knex";

import { inMemoryKeyStore } from "@app/keystore/memory";
import { infisicalSymmetricDecrypt } from "@app/lib/crypto/encryption";
import { selectAllTableCols } from "@app/lib/knex";
import { KmsDataKey } from "@app/services/kms/kms-types";

import { SecretKeyEncoding, TableName } from "../schemas";
import { getMigrationEnvConfig } from "./utils/env-config";
import { newRingBuffer } from "./utils/ring-buffer";
import { getMigrationEncryptionServices } from "./utils/services";

const BATCH_SIZE = 500;
export async function up(knex: Knex): Promise<void> {
  const hasEncryptedInputColumn = await knex.schema.hasColumn(TableName.DynamicSecret, "encryptedInput");

  const hasDynamicSecretTable = await knex.schema.hasTable(TableName.DynamicSecret);
  if (hasDynamicSecretTable) {
    await knex.schema.alterTable(TableName.DynamicSecret, (t) => {
      if (!hasEncryptedInputColumn) t.binary("encryptedInput");
    });
  }

  const envConfig = getMigrationEnvConfig();
  const keyStore = inMemoryKeyStore();
  const { kmsService } = await getMigrationEncryptionServices({ envConfig, keyStore, db: knex });
  const projectEncryptionRingBuffer =
    newRingBuffer<Awaited<ReturnType<(typeof kmsService)["createCipherPairWithDataKey"]>>>(25);

  const dynamicSecretRootCredentials = await knex(TableName.DynamicSecret)
    .leftJoin(TableName.SecretFolder, `${TableName.SecretFolder}.id`, `${TableName.DynamicSecret}.folderId`)
    .leftJoin(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
    .select(selectAllTableCols(TableName.DynamicSecret))
    .select(knex.ref("projectId").withSchema(TableName.Environment));

  const updatedDynamicSecrets = await Promise.all(
    dynamicSecretRootCredentials.map(async (el) => {
      let projectKmsService = projectEncryptionRingBuffer.getItem(el.projectId);
      if (!projectKmsService) {
        projectKmsService = await kmsService.createCipherPairWithDataKey({
          type: KmsDataKey.SecretManager,
          projectId: el.projectId
        });
        projectEncryptionRingBuffer.push(el.projectId, projectKmsService);
      }

      const decryptedInputData =
        el.inputIV && el.inputTag && el.inputCiphertext && el.keyEncoding
          ? infisicalSymmetricDecrypt({
              keyEncoding: el.keyEncoding as SecretKeyEncoding,
              iv: el.inputIV,
              tag: el.inputTag,
              ciphertext: el.inputCiphertext
            })
          : null;

      const encryptedInput = decryptedInputData
        ? projectKmsService.encryptor({
            plainText: Buffer.from(decryptedInputData)
          })
        : null;
      return { ...el, encryptedInput };
    })
  );

  for (let i = 0; i < updatedDynamicSecrets.length; i += BATCH_SIZE) {
    // eslint-disable-next-line no-await-in-loop
    await knex(TableName.DynamicSecret)
      .insert(updatedDynamicSecrets.slice(i, i + BATCH_SIZE))
      .onConflict("id")
      .merge();
  }

  if (hasDynamicSecretTable) {
    await knex.schema.alterTable(TableName.DynamicSecret, (t) => {
      if (!hasEncryptedInputColumn) t.binary("encryptedInput").notNullable().alter();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasEncryptedInputColumn = await knex.schema.hasColumn(TableName.DynamicSecret, "encryptedInput");

  const hasDynamicSecretTable = await knex.schema.hasTable(TableName.DynamicSecret);
  if (hasDynamicSecretTable) {
    await knex.schema.alterTable(TableName.DynamicSecret, (t) => {
      if (hasEncryptedInputColumn) t.dropColumn("encryptedInput");
    });
  }
}
