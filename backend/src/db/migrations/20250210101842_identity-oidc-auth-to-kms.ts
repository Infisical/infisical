import { Knex } from "knex";

import { inMemoryKeyStore } from "@app/keystore/memory";
import { crypto, SymmetricKeySize } from "@app/lib/crypto/cryptography";
import { selectAllTableCols } from "@app/lib/knex";
import { initLogger } from "@app/lib/logger";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { superAdminDALFactory } from "@app/services/super-admin/super-admin-dal";

import { SecretKeyEncoding, TableName, TOrgBots } from "../schemas";
import { getMigrationEnvConfig } from "./utils/env-config";
import { createCircularCache } from "./utils/ring-buffer";
import { getMigrationEncryptionServices } from "./utils/services";

const BATCH_SIZE = 500;
const reencryptIdentityOidcAuth = async (knex: Knex) => {
  const hasEncryptedCertificateColumn = await knex.schema.hasColumn(
    TableName.IdentityOidcAuth,
    "encryptedCaCertificate"
  );
  const hasidentityOidcAuthTable = await knex.schema.hasTable(TableName.IdentityOidcAuth);

  const hasEncryptedCaCertColumn = await knex.schema.hasColumn(TableName.IdentityOidcAuth, "encryptedCaCert");
  const hasCaCertIVColumn = await knex.schema.hasColumn(TableName.IdentityOidcAuth, "caCertIV");
  const hasCaCertTagColumn = await knex.schema.hasColumn(TableName.IdentityOidcAuth, "caCertTag");

  if (hasidentityOidcAuthTable) {
    await knex.schema.alterTable(TableName.IdentityOidcAuth, (t) => {
      if (hasEncryptedCaCertColumn) t.text("encryptedCaCert").nullable().alter();
      if (hasCaCertIVColumn) t.string("caCertIV").nullable().alter();
      if (hasCaCertTagColumn) t.string("caCertTag").nullable().alter();

      if (!hasEncryptedCertificateColumn) t.binary("encryptedCaCertificate");
    });
  }

  initLogger();
  const superAdminDAL = superAdminDALFactory(knex);
  const envConfig = await getMigrationEnvConfig(superAdminDAL);

  const keyStore = inMemoryKeyStore();
  const { kmsService } = await getMigrationEncryptionServices({ envConfig, keyStore, db: knex });
  const orgEncryptionRingBuffer =
    createCircularCache<Awaited<ReturnType<(typeof kmsService)["createCipherPairWithDataKey"]>>>(25);

  const identityOidcConfig = await knex(TableName.IdentityOidcAuth)
    .join(
      TableName.IdentityOrgMembership,
      `${TableName.IdentityOrgMembership}.identityId`,
      `${TableName.IdentityOidcAuth}.identityId`
    )
    .join<TOrgBots>(TableName.OrgBot, `${TableName.OrgBot}.orgId`, `${TableName.IdentityOrgMembership}.orgId`)
    .select(selectAllTableCols(TableName.IdentityOidcAuth))
    .select(
      knex.ref("encryptedSymmetricKey").withSchema(TableName.OrgBot),
      knex.ref("symmetricKeyIV").withSchema(TableName.OrgBot),
      knex.ref("symmetricKeyTag").withSchema(TableName.OrgBot),
      knex.ref("symmetricKeyKeyEncoding").withSchema(TableName.OrgBot),
      knex.ref("orgId").withSchema(TableName.OrgBot)
    )
    .orderBy(`${TableName.OrgBot}.orgId` as "orgId");

  const updatedIdentityOidcConfigs = await Promise.all(
    identityOidcConfig.map(
      async ({ encryptedSymmetricKey, symmetricKeyKeyEncoding, symmetricKeyTag, symmetricKeyIV, orgId, ...el }) => {
        let orgKmsService = orgEncryptionRingBuffer.getItem(orgId);
        if (!orgKmsService) {
          orgKmsService = await kmsService.createCipherPairWithDataKey(
            {
              type: KmsDataKey.Organization,
              orgId
            },
            knex
          );
          orgEncryptionRingBuffer.push(orgId, orgKmsService);
        }

        const key = crypto
          .encryption()
          .symmetric()
          .decryptWithRootEncryptionKey({
            ciphertext: encryptedSymmetricKey,
            iv: symmetricKeyIV,
            tag: symmetricKeyTag,
            keyEncoding: symmetricKeyKeyEncoding as SecretKeyEncoding
          });

        const decryptedCertificate =
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore This will be removed in next cycle so ignore the ts missing error
          el.encryptedCaCert && el.caCertIV && el.caCertTag
            ? crypto.encryption().symmetric().decrypt({
                key,
                keySize: SymmetricKeySize.Bits256,
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore This will be removed in next cycle so ignore the ts missing error
                iv: el.caCertIV,
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore This will be removed in next cycle so ignore the ts missing error
                tag: el.caCertTag,
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore This will be removed in next cycle so ignore the ts missing error
                ciphertext: el.encryptedCaCert
              })
            : "";

        const encryptedCaCertificate = orgKmsService.encryptor({
          plainText: Buffer.from(decryptedCertificate)
        }).cipherTextBlob;

        return {
          ...el,
          accessTokenTrustedIps: JSON.stringify(el.accessTokenTrustedIps),
          encryptedCaCertificate
        };
      }
    )
  );

  for (let i = 0; i < updatedIdentityOidcConfigs.length; i += BATCH_SIZE) {
    // eslint-disable-next-line no-await-in-loop
    await knex(TableName.IdentityOidcAuth)
      .insert(updatedIdentityOidcConfigs.slice(i, i + BATCH_SIZE))
      .onConflict("id")
      .merge();
  }
};

export async function up(knex: Knex): Promise<void> {
  await reencryptIdentityOidcAuth(knex);
}

const dropIdentityOidcColumns = async (knex: Knex) => {
  const hasEncryptedCertificateColumn = await knex.schema.hasColumn(
    TableName.IdentityOidcAuth,
    "encryptedCaCertificate"
  );
  const hasidentityOidcTable = await knex.schema.hasTable(TableName.IdentityOidcAuth);

  if (hasidentityOidcTable) {
    await knex.schema.alterTable(TableName.IdentityOidcAuth, (t) => {
      if (hasEncryptedCertificateColumn) t.dropColumn("encryptedCaCertificate");
    });
  }
};

export async function down(knex: Knex): Promise<void> {
  await dropIdentityOidcColumns(knex);
}
