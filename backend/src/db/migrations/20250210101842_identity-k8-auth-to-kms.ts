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
const reencryptIdentityK8sAuth = async (knex: Knex) => {
  const hasEncryptedKubernetesTokenReviewerJwt = await knex.schema.hasColumn(
    TableName.IdentityKubernetesAuth,
    "encryptedKubernetesTokenReviewerJwt"
  );
  const hasEncryptedCertificateColumn = await knex.schema.hasColumn(
    TableName.IdentityKubernetesAuth,
    "encryptedKubernetesCaCertificate"
  );
  const hasidentityKubernetesAuthTable = await knex.schema.hasTable(TableName.IdentityKubernetesAuth);

  const hasEncryptedCaCertColumn = await knex.schema.hasColumn(TableName.IdentityKubernetesAuth, "encryptedCaCert");
  const hasCaCertIVColumn = await knex.schema.hasColumn(TableName.IdentityKubernetesAuth, "caCertIV");
  const hasCaCertTagColumn = await knex.schema.hasColumn(TableName.IdentityKubernetesAuth, "caCertTag");
  const hasEncryptedTokenReviewerJwtColumn = await knex.schema.hasColumn(
    TableName.IdentityKubernetesAuth,
    "encryptedTokenReviewerJwt"
  );
  const hasTokenReviewerJwtIVColumn = await knex.schema.hasColumn(
    TableName.IdentityKubernetesAuth,
    "tokenReviewerJwtIV"
  );
  const hasTokenReviewerJwtTagColumn = await knex.schema.hasColumn(
    TableName.IdentityKubernetesAuth,
    "tokenReviewerJwtTag"
  );

  if (hasidentityKubernetesAuthTable) {
    await knex.schema.alterTable(TableName.IdentityKubernetesAuth, (t) => {
      if (hasEncryptedCaCertColumn) t.text("encryptedCaCert").nullable().alter();
      if (hasCaCertIVColumn) t.string("caCertIV").nullable().alter();
      if (hasCaCertTagColumn) t.string("caCertTag").nullable().alter();
      if (hasEncryptedTokenReviewerJwtColumn) t.text("encryptedTokenReviewerJwt").nullable().alter();
      if (hasTokenReviewerJwtIVColumn) t.string("tokenReviewerJwtIV").nullable().alter();
      if (hasTokenReviewerJwtTagColumn) t.string("tokenReviewerJwtTag").nullable().alter();

      if (!hasEncryptedKubernetesTokenReviewerJwt) t.binary("encryptedKubernetesTokenReviewerJwt");
      if (!hasEncryptedCertificateColumn) t.binary("encryptedKubernetesCaCertificate");
    });
  }

  initLogger();
  const superAdminDAL = superAdminDALFactory(knex);
  const envConfig = await getMigrationEnvConfig(superAdminDAL);

  const keyStore = inMemoryKeyStore();
  const { kmsService } = await getMigrationEncryptionServices({ envConfig, keyStore, db: knex });
  const orgEncryptionRingBuffer =
    createCircularCache<Awaited<ReturnType<(typeof kmsService)["createCipherPairWithDataKey"]>>>(25);
  const identityKubernetesConfigs = await knex(TableName.IdentityKubernetesAuth)
    .join(
      TableName.IdentityOrgMembership,
      `${TableName.IdentityOrgMembership}.identityId`,
      `${TableName.IdentityKubernetesAuth}.identityId`
    )
    .join<TOrgBots>(TableName.OrgBot, `${TableName.OrgBot}.orgId`, `${TableName.IdentityOrgMembership}.orgId`)
    .select(selectAllTableCols(TableName.IdentityKubernetesAuth))
    .select(
      knex.ref("encryptedSymmetricKey").withSchema(TableName.OrgBot),
      knex.ref("symmetricKeyIV").withSchema(TableName.OrgBot),
      knex.ref("symmetricKeyTag").withSchema(TableName.OrgBot),
      knex.ref("symmetricKeyKeyEncoding").withSchema(TableName.OrgBot),
      knex.ref("orgId").withSchema(TableName.OrgBot)
    )
    .orderBy(`${TableName.OrgBot}.orgId` as "orgId");

  const updatedIdentityKubernetesConfigs = [];

  for await (const {
    encryptedSymmetricKey,
    symmetricKeyKeyEncoding,
    symmetricKeyTag,
    symmetricKeyIV,
    orgId,
    ...el
  } of identityKubernetesConfigs) {
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

    const decryptedTokenReviewerJwt =
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore This will be removed in next cycle so ignore the ts missing error
      el.encryptedTokenReviewerJwt && el.tokenReviewerJwtIV && el.tokenReviewerJwtTag
        ? crypto.encryption().symmetric().decrypt({
            key,
            keySize: SymmetricKeySize.Bits256,
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore This will be removed in next cycle so ignore the ts missing error
            iv: el.tokenReviewerJwtIV,
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore This will be removed in next cycle so ignore the ts missing error
            tag: el.tokenReviewerJwtTag,
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore This will be removed in next cycle so ignore the ts missing error
            ciphertext: el.encryptedTokenReviewerJwt
          })
        : "";

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

    const encryptedKubernetesTokenReviewerJwt = orgKmsService.encryptor({
      plainText: Buffer.from(decryptedTokenReviewerJwt)
    }).cipherTextBlob;
    const encryptedKubernetesCaCertificate = orgKmsService.encryptor({
      plainText: Buffer.from(decryptedCertificate)
    }).cipherTextBlob;

    updatedIdentityKubernetesConfigs.push({
      ...el,
      accessTokenTrustedIps: JSON.stringify(el.accessTokenTrustedIps),
      encryptedKubernetesCaCertificate,
      encryptedKubernetesTokenReviewerJwt
    });
  }

  for (let i = 0; i < updatedIdentityKubernetesConfigs.length; i += BATCH_SIZE) {
    // eslint-disable-next-line no-await-in-loop
    await knex(TableName.IdentityKubernetesAuth)
      .insert(updatedIdentityKubernetesConfigs.slice(i, i + BATCH_SIZE))
      .onConflict("id")
      .merge();
  }
  if (hasidentityKubernetesAuthTable) {
    await knex.schema.alterTable(TableName.IdentityKubernetesAuth, (t) => {
      if (!hasEncryptedKubernetesTokenReviewerJwt)
        t.binary("encryptedKubernetesTokenReviewerJwt").notNullable().alter();
    });
  }
};

export async function up(knex: Knex): Promise<void> {
  await reencryptIdentityK8sAuth(knex);
}

const dropIdentityK8sColumns = async (knex: Knex) => {
  const hasEncryptedKubernetesTokenReviewerJwt = await knex.schema.hasColumn(
    TableName.IdentityKubernetesAuth,
    "encryptedKubernetesTokenReviewerJwt"
  );
  const hasEncryptedCertificateColumn = await knex.schema.hasColumn(
    TableName.IdentityKubernetesAuth,
    "encryptedKubernetesCaCertificate"
  );
  const hasidentityKubernetesAuthTable = await knex.schema.hasTable(TableName.IdentityKubernetesAuth);

  if (hasidentityKubernetesAuthTable) {
    await knex.schema.alterTable(TableName.IdentityKubernetesAuth, (t) => {
      if (hasEncryptedKubernetesTokenReviewerJwt) t.dropColumn("encryptedKubernetesTokenReviewerJwt");
      if (hasEncryptedCertificateColumn) t.dropColumn("encryptedKubernetesCaCertificate");
    });
  }
};

export async function down(knex: Knex): Promise<void> {
  await dropIdentityK8sColumns(knex);
}
