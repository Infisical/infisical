import { Knex } from "knex";

import { inMemoryKeyStore } from "@app/keystore/memory";
import { crypto } from "@app/lib/crypto/cryptography";
import { selectAllTableCols } from "@app/lib/knex";
import { initLogger } from "@app/lib/logger";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { superAdminDALFactory } from "@app/services/super-admin/super-admin-dal";

import { SecretKeyEncoding, TableName } from "../schemas";
import { getMigrationEnvConfig } from "./utils/env-config";
import { createCircularCache } from "./utils/ring-buffer";
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

  initLogger();
  const superAdminDAL = superAdminDALFactory(knex);
  const envConfig = await getMigrationEnvConfig(superAdminDAL);

  const keyStore = inMemoryKeyStore();
  const { kmsService } = await getMigrationEncryptionServices({ envConfig, keyStore, db: knex });
  const projectEncryptionRingBuffer =
    createCircularCache<Awaited<ReturnType<(typeof kmsService)["createCipherPairWithDataKey"]>>>(25);

  const secretRotations = await knex(TableName.SecretRotation)
    .join(TableName.Environment, `${TableName.Environment}.id`, `${TableName.SecretRotation}.envId`)
    .select(selectAllTableCols(TableName.SecretRotation))
    .select(knex.ref("projectId").withSchema(TableName.Environment))
    .orderBy(`${TableName.Environment}.projectId` as "projectId");

  const updatedRotationData = await Promise.all(
    secretRotations.map(async ({ projectId, ...el }) => {
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

      const decryptedRotationData =
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore This will be removed in next cycle so ignore the ts missing error
        el.encryptedDataTag && el.encryptedDataIV && el.encryptedData && el.keyEncoding
          ? crypto
              .encryption()
              .symmetric()
              .decryptWithRootEncryptionKey({
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore This will be removed in next cycle so ignore the ts missing error
                keyEncoding: el.keyEncoding as SecretKeyEncoding,
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore This will be removed in next cycle so ignore the ts missing error
                iv: el.encryptedDataIV,
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore This will be removed in next cycle so ignore the ts missing error
                tag: el.encryptedDataTag,
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore This will be removed in next cycle so ignore the ts missing error
                ciphertext: el.encryptedData
              })
          : "";

      const encryptedRotationData = projectKmsService.encryptor({
        plainText: Buffer.from(decryptedRotationData)
      }).cipherTextBlob;
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
