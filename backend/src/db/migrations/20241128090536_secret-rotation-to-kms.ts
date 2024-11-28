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
  const hasEncryptedRotationData = await knex.schema.hasColumn(TableName.SecretRotation, "encryptedRotationData");

  const hasRotationTable = await knex.schema.hasTable(TableName.SecretRotation);
  if (hasRotationTable) {
    await knex.schema.alterTable(TableName.SecretRotation, (t) => {
      if (!hasEncryptedRotationData) t.binary("encryptedRotationData");
    });
  }

  const envConfig = getMigrationEnvConfig();
  const keyStore = inMemoryKeyStore();
  const { kmsService } = await getMigrationEncryptionServices({ envConfig, keyStore, db: knex });
  const projectEncryptionRingBuffer =
    newRingBuffer<Awaited<ReturnType<(typeof kmsService)["createCipherPairWithDataKey"]>>>(25);

  const secretRotations = await knex(TableName.SecretRotation)
    .leftJoin(TableName.Environment, `${TableName.Environment}.id`, `${TableName.SecretRotation}.envId`)
    .select(selectAllTableCols(TableName.SecretRotation))
    .select(knex.ref("projectId").withSchema(TableName.Environment));

  const updatedRotationData = await Promise.all(
    secretRotations.map(async (el) => {
      let projectKmsService = projectEncryptionRingBuffer.getItem(el.projectId);
      if (!projectKmsService) {
        projectKmsService = await kmsService.createCipherPairWithDataKey({
          type: KmsDataKey.SecretManager,
          projectId: el.projectId
        });
        projectEncryptionRingBuffer.push(el.projectId, projectKmsService);
      }

      const decryptedRotationData =
        el.encryptedDataTag && el.encryptedDataIV && el.encryptedData && el.keyEncoding
          ? infisicalSymmetricDecrypt({
              keyEncoding: el.keyEncoding as SecretKeyEncoding,
              iv: el.encryptedDataIV,
              tag: el.encryptedDataTag,
              ciphertext: el.encryptedData
            })
          : null;

      const encryptedRotationData = decryptedRotationData
        ? projectKmsService.encryptor({
            plainText: Buffer.from(decryptedRotationData)
          })
        : null;
      return { ...el, encryptedRotationData };
    })
  );

  for (let i = 0; i < updatedRotationData.length; i += BATCH_SIZE) {
    // eslint-disable-next-line no-await-in-loop
    await knex(TableName.SecretRotation)
      .insert(updatedRotationData.slice(i, i + BATCH_SIZE))
      .onConflict("id")
      .merge();
  }

  if (hasRotationTable) {
    await knex.schema.alterTable(TableName.SecretRotation, (t) => {
      if (!hasEncryptedRotationData) t.binary("encryptedRotationData").notNullable().alter();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasEncryptedRotationData = await knex.schema.hasColumn(TableName.SecretRotation, "encryptedRotationData");

  const hasRotationTable = await knex.schema.hasTable(TableName.SecretRotation);
  if (hasRotationTable) {
    await knex.schema.alterTable(TableName.SecretRotation, (t) => {
      if (hasEncryptedRotationData) t.dropColumn("encryptedRotationData");
    });
  }
}
