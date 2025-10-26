import { Knex } from "knex";

import { inMemoryKeyStore } from "@app/keystore/memory";
import { crypto } from "@app/lib/crypto/cryptography";
import { selectAllTableCols } from "@app/lib/knex";
import { initLogger } from "@app/lib/logger";
import { kmsRootConfigDALFactory } from "@app/services/kms/kms-root-config-dal";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { superAdminDALFactory } from "@app/services/super-admin/super-admin-dal";

import { SecretKeyEncoding, TableName } from "../schemas";
import { getMigrationEnvConfig, getMigrationHsmConfig } from "./utils/env-config";
import { createCircularCache } from "./utils/ring-buffer";
import { getMigrationEncryptionServices, getMigrationHsmService } from "./utils/services";

const BATCH_SIZE = 500;
export async function up(knex: Knex): Promise<void> {
  const hasEncryptedInputColumn = await knex.schema.hasColumn(TableName.DynamicSecret, "encryptedInput");
  const hasInputCiphertextColumn = await knex.schema.hasColumn(TableName.DynamicSecret, "inputCiphertext");
  const hasInputIVColumn = await knex.schema.hasColumn(TableName.DynamicSecret, "inputIV");
  const hasInputTagColumn = await knex.schema.hasColumn(TableName.DynamicSecret, "inputTag");

  const hasDynamicSecretTable = await knex.schema.hasTable(TableName.DynamicSecret);
  if (hasDynamicSecretTable) {
    await knex.schema.alterTable(TableName.DynamicSecret, (t) => {
      if (!hasEncryptedInputColumn) t.binary("encryptedInput");
      if (hasInputCiphertextColumn) t.text("inputCiphertext").nullable().alter();
      if (hasInputIVColumn) t.string("inputIV").nullable().alter();
      if (hasInputTagColumn) t.string("inputTag").nullable().alter();
    });
  }

  initLogger();

  const { hsmService } = await getMigrationHsmService({ envConfig: getMigrationHsmConfig() });

  const superAdminDAL = superAdminDALFactory(knex);
  const kmsRootConfigDAL = kmsRootConfigDALFactory(knex);
  const envConfig = await getMigrationEnvConfig(superAdminDAL, hsmService, kmsRootConfigDAL);

  const keyStore = inMemoryKeyStore();
  const { kmsService } = await getMigrationEncryptionServices({ envConfig, keyStore, db: knex });
  const projectEncryptionRingBuffer =
    createCircularCache<Awaited<ReturnType<(typeof kmsService)["createCipherPairWithDataKey"]>>>(25);

  const dynamicSecretRootCredentials = await knex(TableName.DynamicSecret)
    .join(TableName.SecretFolder, `${TableName.SecretFolder}.id`, `${TableName.DynamicSecret}.folderId`)
    .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
    .select(selectAllTableCols(TableName.DynamicSecret))
    .select(knex.ref("projectId").withSchema(TableName.Environment))
    .orderBy(`${TableName.Environment}.projectId` as "projectId");

  const updatedDynamicSecrets = await Promise.all(
    dynamicSecretRootCredentials.map(async ({ projectId, ...el }) => {
      let projectKmsService = projectEncryptionRingBuffer.getItem(projectId);
      if (!projectKmsService) {
        projectKmsService = await kmsService.createCipherPairWithDataKey(
          {
            type: KmsDataKey.SecretManager,
            projectId
          },
          knex
        );
        projectEncryptionRingBuffer.push(projectId, projectKmsService);
      }

      const decryptedInputData =
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore This will be removed in next cycle so ignore the ts missing error
        el.inputIV && el.inputTag && el.inputCiphertext && el.keyEncoding
          ? crypto
              .encryption()
              .symmetric()
              .decryptWithRootEncryptionKey({
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore This will be removed in next cycle so ignore the ts missing error
                keyEncoding: el.keyEncoding as SecretKeyEncoding,
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore This will be removed in next cycle so ignore the ts missing error
                iv: el.inputIV,
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore This will be removed in next cycle so ignore the ts missing error
                tag: el.inputTag,
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore This will be removed in next cycle so ignore the ts missing error
                ciphertext: el.inputCiphertext
              })
          : "";

      const encryptedInput = projectKmsService.encryptor({
        plainText: Buffer.from(decryptedInputData)
      }).cipherTextBlob;

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
