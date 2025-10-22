import { Knex } from "knex";

import { inMemoryKeyStore } from "@app/keystore/memory";
import { crypto } from "@app/lib/crypto/cryptography";
import { kmsRootConfigDALFactory } from "@app/services/kms/kms-root-config-dal";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { superAdminDALFactory } from "@app/services/super-admin/super-admin-dal";

import { SecretKeyEncoding, TableName } from "../schemas";
import { getMigrationEnvConfig, getMigrationHsmConfig } from "./utils/env-config";
import { createCircularCache } from "./utils/ring-buffer";
import { getMigrationEncryptionServices, getMigrationHsmService } from "./utils/services";

const BATCH_SIZE = 500;
export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.AuditLogStream)) {
    const hasProvider = await knex.schema.hasColumn(TableName.AuditLogStream, "provider");
    const hasEncryptedCredentials = await knex.schema.hasColumn(TableName.AuditLogStream, "encryptedCredentials");

    await knex.schema.alterTable(TableName.AuditLogStream, (t) => {
      if (!hasProvider) t.string("provider").notNullable().defaultTo("custom");
      if (!hasEncryptedCredentials) t.binary("encryptedCredentials");

      // This column will no longer be used but we're not dropping it so that we can have a backup in case the migration goes wrong
      t.string("url").nullable().alter();
    });

    if (!hasEncryptedCredentials) {
      const { hsmService } = await getMigrationHsmService({ envConfig: getMigrationHsmConfig() });
      const superAdminDAL = superAdminDALFactory(knex);
      const kmsRootConfigDAL = kmsRootConfigDALFactory(knex);
      const envConfig = await getMigrationEnvConfig(superAdminDAL, hsmService, kmsRootConfigDAL);
      const keyStore = inMemoryKeyStore();

      const { kmsService } = await getMigrationEncryptionServices({ envConfig, keyStore, db: knex });

      const orgEncryptionRingBuffer =
        createCircularCache<Awaited<ReturnType<(typeof kmsService)["createCipherPairWithDataKey"]>>>(25);

      const logStreams = await knex(TableName.AuditLogStream).select(
        "id",
        "orgId",

        "url",
        "encryptedHeadersAlgorithm",
        "encryptedHeadersCiphertext",
        "encryptedHeadersIV",
        "encryptedHeadersKeyEncoding",
        "encryptedHeadersTag"
      );

      const updatedLogStreams = await Promise.all(
        logStreams.map(async (el) => {
          let orgKmsService = orgEncryptionRingBuffer.getItem(el.orgId);
          if (!orgKmsService) {
            orgKmsService = await kmsService.createCipherPairWithDataKey(
              {
                type: KmsDataKey.Organization,
                orgId: el.orgId
              },
              knex
            );
            orgEncryptionRingBuffer.push(el.orgId, orgKmsService);
          }

          const provider = "custom";
          let credentials;

          if (
            el.encryptedHeadersTag &&
            el.encryptedHeadersIV &&
            el.encryptedHeadersCiphertext &&
            el.encryptedHeadersKeyEncoding
          ) {
            const decryptedHeaders = crypto
              .encryption()
              .symmetric()
              .decryptWithRootEncryptionKey({
                tag: el.encryptedHeadersTag,
                iv: el.encryptedHeadersIV,
                ciphertext: el.encryptedHeadersCiphertext,
                keyEncoding: el.encryptedHeadersKeyEncoding as SecretKeyEncoding
              });

            credentials = {
              url: el.url,
              headers: JSON.parse(decryptedHeaders)
            };
          } else {
            credentials = {
              url: el.url,
              headers: []
            };
          }

          const encryptedCredentials = orgKmsService.encryptor({
            plainText: Buffer.from(JSON.stringify(credentials), "utf8")
          }).cipherTextBlob;

          return {
            id: el.id,
            orgId: el.orgId,
            url: el.url,
            provider,
            encryptedCredentials
          };
        })
      );

      for (let i = 0; i < updatedLogStreams.length; i += BATCH_SIZE) {
        // eslint-disable-next-line no-await-in-loop
        await knex(TableName.AuditLogStream)
          .insert(updatedLogStreams.slice(i, i + BATCH_SIZE))
          .onConflict("id")
          .merge();
      }

      await knex.schema.alterTable(TableName.AuditLogStream, (t) => {
        t.binary("encryptedCredentials").notNullable().alter();
      });
    }
  }
}

// IMPORTANT: The down migration does not utilize the existing "url" and encrypted header columns
// because we're taking the latest data from the credentials column and re-encrypting it into relevant columns
//
// If this down migration was to fail, you can fall-back to the existing URL and encrypted header columns to retrieve
// data that was created prior to this migration

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.AuditLogStream)) {
    const hasProvider = await knex.schema.hasColumn(TableName.AuditLogStream, "provider");
    const hasEncryptedCredentials = await knex.schema.hasColumn(TableName.AuditLogStream, "encryptedCredentials");

    if (hasEncryptedCredentials) {
      const { hsmService } = await getMigrationHsmService({ envConfig: getMigrationHsmConfig() });

      const superAdminDAL = superAdminDALFactory(knex);
      const kmsRootConfigDAL = kmsRootConfigDALFactory(knex);
      const envConfig = await getMigrationEnvConfig(superAdminDAL, hsmService, kmsRootConfigDAL);
      const keyStore = inMemoryKeyStore();

      const { kmsService } = await getMigrationEncryptionServices({ envConfig, keyStore, db: knex });

      const orgEncryptionRingBuffer =
        createCircularCache<Awaited<ReturnType<(typeof kmsService)["createCipherPairWithDataKey"]>>>(25);

      const logStreamsToRevert = await knex(TableName.AuditLogStream)
        .select("id", "orgId", "encryptedCredentials")
        .where("provider", "custom")
        .whereNotNull("encryptedCredentials");

      const updatedLogStreams = await Promise.all(
        logStreamsToRevert.map(async (el) => {
          let orgKmsService = orgEncryptionRingBuffer.getItem(el.orgId);
          if (!orgKmsService) {
            orgKmsService = await kmsService.createCipherPairWithDataKey(
              {
                type: KmsDataKey.Organization,
                orgId: el.orgId
              },
              knex
            );
            orgEncryptionRingBuffer.push(el.orgId, orgKmsService);
          }

          const decryptedCredentials = orgKmsService
            .decryptor({
              cipherTextBlob: el.encryptedCredentials
            })
            .toString();

          const credentials: { url: string; headers: { key: string; value: string }[] } =
            JSON.parse(decryptedCredentials);

          const originalUrl: string = credentials.url;

          const encryptedHeadersResult = crypto
            .encryption()
            .symmetric()
            .encryptWithRootEncryptionKey(JSON.stringify(credentials.headers), envConfig);

          const encryptedHeadersAlgorithm: string = encryptedHeadersResult.algorithm;
          const encryptedHeadersCiphertext: string = encryptedHeadersResult.ciphertext;
          const encryptedHeadersIV: string = encryptedHeadersResult.iv;
          const encryptedHeadersKeyEncoding: string = encryptedHeadersResult.encoding;
          const encryptedHeadersTag: string = encryptedHeadersResult.tag;

          return {
            id: el.id,
            orgId: el.orgId,
            encryptedCredentials: el.encryptedCredentials,

            url: originalUrl,
            encryptedHeadersAlgorithm,
            encryptedHeadersCiphertext,
            encryptedHeadersIV,
            encryptedHeadersKeyEncoding,
            encryptedHeadersTag
          };
        })
      );

      for (let i = 0; i < updatedLogStreams.length; i += BATCH_SIZE) {
        // eslint-disable-next-line no-await-in-loop
        await knex(TableName.AuditLogStream)
          .insert(updatedLogStreams.slice(i, i + BATCH_SIZE))
          .onConflict("id")
          .merge();
      }

      await knex(TableName.AuditLogStream)
        .where((qb) => {
          void qb.whereNot("provider", "custom").orWhereNull("url");
        })
        .del();
    }

    await knex.schema.alterTable(TableName.AuditLogStream, (t) => {
      t.string("url").notNullable().alter();

      if (hasProvider) t.dropColumn("provider");
      if (hasEncryptedCredentials) t.dropColumn("encryptedCredentials");
    });
  }
}
