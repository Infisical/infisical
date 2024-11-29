import { Knex } from "knex";

import { inMemoryKeyStore } from "@app/keystore/memory";
import { infisicalSymmetricDecrypt } from "@app/lib/crypto/encryption";
import { initLogger } from "@app/lib/logger";
import { KmsDataKey } from "@app/services/kms/kms-types";

import { SecretKeyEncoding, TableName } from "../schemas";
import { getMigrationEnvConfig } from "./utils/env-config";
import { newRingBuffer } from "./utils/ring-buffer";
import { getMigrationEncryptionServices } from "./utils/services";

const BATCH_SIZE = 500;
export async function up(knex: Knex): Promise<void> {
  const hasEncryptedKey = await knex.schema.hasColumn(TableName.Webhook, "encryptedPassKey");
  const hasEncryptedUrl = await knex.schema.hasColumn(TableName.Webhook, "encryptedUrl");

  const hasWebhookTable = await knex.schema.hasTable(TableName.Webhook);
  if (hasWebhookTable) {
    await knex.schema.alterTable(TableName.Webhook, (t) => {
      if (!hasEncryptedKey) t.binary("encryptedPassKey");
      if (!hasEncryptedUrl) t.binary("encryptedUrl");
    });
  }

  await initLogger();
  const envConfig = getMigrationEnvConfig();
  const keyStore = inMemoryKeyStore();
  const { kmsService } = await getMigrationEncryptionServices({ envConfig, keyStore, db: knex });
  const projectEncryptionRingBuffer =
    newRingBuffer<Awaited<ReturnType<(typeof kmsService)["createCipherPairWithDataKey"]>>>(25);

  const webhooks = await knex(TableName.Webhook)
    .where({})
    .leftJoin(TableName.Environment, `${TableName.Environment}.id`, `${TableName.Webhook}.envId`)
    .select(
      "url",
      "encryptedSecretKey",
      "iv",
      "tag",
      "keyEncoding",
      "urlCipherText",
      "urlIV",
      "urlTag",
      knex.ref("id").withSchema(TableName.Webhook),
      "envId"
    )
    .select(knex.ref("projectId").withSchema(TableName.Environment));

  const updatedWebhooks = await Promise.all(
    webhooks.map(async (el) => {
      let projectKmsService = projectEncryptionRingBuffer.getItem(el.projectId);
      if (!projectKmsService) {
        projectKmsService = await kmsService.createCipherPairWithDataKey({
          type: KmsDataKey.SecretManager,
          projectId: el.projectId
        });
        projectEncryptionRingBuffer.push(el.projectId, projectKmsService);
      }

      let encryptedSecretKey = null;
      if (el.encryptedSecretKey && el.iv && el.tag && el.keyEncoding) {
        const decyptedSecretKey = infisicalSymmetricDecrypt({
          keyEncoding: el.keyEncoding as SecretKeyEncoding,
          iv: el.iv,
          tag: el.tag,
          ciphertext: el.encryptedSecretKey
        });
        encryptedSecretKey = projectKmsService.encryptor({
          plainText: Buffer.from(decyptedSecretKey, "utf8")
        }).cipherTextBlob;
      }

      const decryptedUrl =
        el.urlIV && el.urlTag && el.urlCipherText && el.keyEncoding
          ? infisicalSymmetricDecrypt({
              keyEncoding: el.keyEncoding as SecretKeyEncoding,
              iv: el.urlIV,
              tag: el.urlTag,
              ciphertext: el.urlCipherText
            })
          : null;

      const encryptedUrl = projectKmsService.encryptor({
        plainText: Buffer.from(decryptedUrl || el.url)
      }).cipherTextBlob;
      return { id: el.id, encryptedUrl, encryptedSecretKey, envId: el.envId };
    })
  );

  for (let i = 0; i < updatedWebhooks.length; i += BATCH_SIZE) {
    // eslint-disable-next-line no-await-in-loop
    await knex(TableName.Webhook)
      .insert(
        updatedWebhooks.slice(i, i + BATCH_SIZE).map((el) => ({
          id: el.id,
          envId: el.envId,
          url: "",
          encryptedUrl: el.encryptedUrl,
          encryptedPassKey: el.encryptedSecretKey
        }))
      )
      .onConflict("id")
      .merge();
  }

  if (hasWebhookTable) {
    await knex.schema.alterTable(TableName.Webhook, (t) => {
      if (!hasEncryptedUrl) t.binary("encryptedUrl").notNullable().alter();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasEncryptedKey = await knex.schema.hasColumn(TableName.Webhook, "encryptedPassKey");
  const hasEncryptedUrl = await knex.schema.hasColumn(TableName.Webhook, "encryptedUrl");

  const hasWebhookTable = await knex.schema.hasTable(TableName.Webhook);
  if (hasWebhookTable) {
    await knex.schema.alterTable(TableName.Webhook, (t) => {
      if (hasEncryptedKey) t.dropColumn("encryptedPassKey");
      if (hasEncryptedUrl) t.dropColumn("encryptedUrl");
    });
  }
}
