import { Knex } from "knex";

import { inMemoryKeyStore } from "@app/keystore/memory";
import { crypto, SymmetricKeySize } from "@app/lib/crypto/cryptography";
import { selectAllTableCols } from "@app/lib/knex";
import { initLogger } from "@app/lib/logger";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { superAdminDALFactory } from "@app/services/super-admin/super-admin-dal";

import { SecretKeyEncoding, TableName } from "../schemas";
import { getMigrationEnvConfig } from "./utils/env-config";
import { createCircularCache } from "./utils/ring-buffer";
import { getMigrationEncryptionServices } from "./utils/services";

const BATCH_SIZE = 500;
const reencryptSamlConfig = async (knex: Knex) => {
  const hasEncryptedEntrypointColumn = await knex.schema.hasColumn(TableName.SamlConfig, "encryptedSamlEntryPoint");
  const hasEncryptedIssuerColumn = await knex.schema.hasColumn(TableName.SamlConfig, "encryptedSamlIssuer");
  const hasEncryptedCertificateColumn = await knex.schema.hasColumn(TableName.SamlConfig, "encryptedSamlCertificate");
  const hasSamlConfigTable = await knex.schema.hasTable(TableName.SamlConfig);

  if (hasSamlConfigTable) {
    await knex.schema.alterTable(TableName.SamlConfig, (t) => {
      if (!hasEncryptedEntrypointColumn) t.binary("encryptedSamlEntryPoint");
      if (!hasEncryptedIssuerColumn) t.binary("encryptedSamlIssuer");
      if (!hasEncryptedCertificateColumn) t.binary("encryptedSamlCertificate");
    });
  }

  initLogger();
  const superAdminDAL = superAdminDALFactory(knex);
  const envConfig = await getMigrationEnvConfig(superAdminDAL);
  const keyStore = inMemoryKeyStore();
  const { kmsService } = await getMigrationEncryptionServices({ envConfig, keyStore, db: knex });
  const orgEncryptionRingBuffer =
    createCircularCache<Awaited<ReturnType<(typeof kmsService)["createCipherPairWithDataKey"]>>>(25);

  const samlConfigs = await knex(TableName.SamlConfig)
    .join(TableName.OrgBot, `${TableName.OrgBot}.orgId`, `${TableName.SamlConfig}.orgId`)
    .select(selectAllTableCols(TableName.SamlConfig))
    .select(
      knex.ref("encryptedSymmetricKey").withSchema(TableName.OrgBot),
      knex.ref("symmetricKeyIV").withSchema(TableName.OrgBot),
      knex.ref("symmetricKeyTag").withSchema(TableName.OrgBot),
      knex.ref("symmetricKeyKeyEncoding").withSchema(TableName.OrgBot)
    )
    .orderBy(`${TableName.OrgBot}.orgId` as "orgId");

  const updatedSamlConfigs = await Promise.all(
    samlConfigs.map(
      async ({ encryptedSymmetricKey, symmetricKeyKeyEncoding, symmetricKeyTag, symmetricKeyIV, ...el }) => {
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

        const key = crypto
          .encryption()
          .symmetric()
          .decryptWithRootEncryptionKey({
            ciphertext: encryptedSymmetricKey,
            iv: symmetricKeyIV,
            tag: symmetricKeyTag,
            keyEncoding: symmetricKeyKeyEncoding as SecretKeyEncoding
          });

        const decryptedEntryPoint =
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore This will be removed in next cycle so ignore the ts missing error
          el.encryptedEntryPoint && el.entryPointIV && el.entryPointTag
            ? crypto.encryption().symmetric().decrypt({
                key,
                keySize: SymmetricKeySize.Bits256,
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore This will be removed in next cycle so ignore the ts missing error
                iv: el.entryPointIV,
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore This will be removed in next cycle so ignore the ts missing error
                tag: el.entryPointTag,
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore This will be removed in next cycle so ignore the ts missing error
                ciphertext: el.encryptedEntryPoint
              })
            : "";

        const decryptedIssuer =
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore This will be removed in next cycle so ignore the ts missing error
          el.encryptedIssuer && el.issuerIV && el.issuerTag
            ? crypto.encryption().symmetric().decrypt({
                key,
                keySize: SymmetricKeySize.Bits256,
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore This will be removed in next cycle so ignore the ts missing error
                iv: el.issuerIV,
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore This will be removed in next cycle so ignore the ts missing error
                tag: el.issuerTag,
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore This will be removed in next cycle so ignore the ts missing error
                ciphertext: el.encryptedIssuer
              })
            : "";

        const decryptedCertificate =
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore This will be removed in next cycle so ignore the ts missing error
          el.encryptedCert && el.certIV && el.certTag
            ? crypto.encryption().symmetric().decrypt({
                key,
                keySize: SymmetricKeySize.Bits256,
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore This will be removed in next cycle so ignore the ts missing error
                iv: el.certIV,
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore This will be removed in next cycle so ignore the ts missing error
                tag: el.certTag,
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore This will be removed in next cycle so ignore the ts missing error
                ciphertext: el.encryptedCert
              })
            : "";

        const encryptedSamlIssuer = orgKmsService.encryptor({
          plainText: Buffer.from(decryptedIssuer)
        }).cipherTextBlob;
        const encryptedSamlCertificate = orgKmsService.encryptor({
          plainText: Buffer.from(decryptedCertificate)
        }).cipherTextBlob;
        const encryptedSamlEntryPoint = orgKmsService.encryptor({
          plainText: Buffer.from(decryptedEntryPoint)
        }).cipherTextBlob;
        return { ...el, encryptedSamlCertificate, encryptedSamlEntryPoint, encryptedSamlIssuer };
      }
    )
  );

  for (let i = 0; i < updatedSamlConfigs.length; i += BATCH_SIZE) {
    // eslint-disable-next-line no-await-in-loop
    await knex(TableName.SamlConfig)
      .insert(updatedSamlConfigs.slice(i, i + BATCH_SIZE))
      .onConflict("id")
      .merge();
  }

  if (hasSamlConfigTable) {
    await knex.schema.alterTable(TableName.SamlConfig, (t) => {
      if (!hasEncryptedEntrypointColumn) t.binary("encryptedSamlEntryPoint").notNullable().alter();
      if (!hasEncryptedIssuerColumn) t.binary("encryptedSamlIssuer").notNullable().alter();
      if (!hasEncryptedCertificateColumn) t.binary("encryptedSamlCertificate").notNullable().alter();
    });
  }
};

const reencryptLdapConfig = async (knex: Knex) => {
  const hasEncryptedLdapBindDNColum = await knex.schema.hasColumn(TableName.LdapConfig, "encryptedLdapBindDN");
  const hasEncryptedLdapBindPassColumn = await knex.schema.hasColumn(TableName.LdapConfig, "encryptedLdapBindPass");
  const hasEncryptedCertificateColumn = await knex.schema.hasColumn(TableName.LdapConfig, "encryptedLdapCaCertificate");
  const hasLdapConfigTable = await knex.schema.hasTable(TableName.LdapConfig);

  const hasEncryptedCACertColumn = await knex.schema.hasColumn(TableName.LdapConfig, "encryptedCACert");
  const hasCaCertIVColumn = await knex.schema.hasColumn(TableName.LdapConfig, "caCertIV");
  const hasCaCertTagColumn = await knex.schema.hasColumn(TableName.LdapConfig, "caCertTag");
  const hasEncryptedBindPassColumn = await knex.schema.hasColumn(TableName.LdapConfig, "encryptedBindPass");
  const hasBindPassIVColumn = await knex.schema.hasColumn(TableName.LdapConfig, "bindPassIV");
  const hasBindPassTagColumn = await knex.schema.hasColumn(TableName.LdapConfig, "bindPassTag");
  const hasEncryptedBindDNColumn = await knex.schema.hasColumn(TableName.LdapConfig, "encryptedBindDN");
  const hasBindDNIVColumn = await knex.schema.hasColumn(TableName.LdapConfig, "bindDNIV");
  const hasBindDNTagColumn = await knex.schema.hasColumn(TableName.LdapConfig, "bindDNTag");

  if (hasLdapConfigTable) {
    await knex.schema.alterTable(TableName.LdapConfig, (t) => {
      if (hasEncryptedCACertColumn) t.text("encryptedCACert").nullable().alter();
      if (hasCaCertIVColumn) t.string("caCertIV").nullable().alter();
      if (hasCaCertTagColumn) t.string("caCertTag").nullable().alter();
      if (hasEncryptedBindPassColumn) t.string("encryptedBindPass").nullable().alter();
      if (hasBindPassIVColumn) t.string("bindPassIV").nullable().alter();
      if (hasBindPassTagColumn) t.string("bindPassTag").nullable().alter();
      if (hasEncryptedBindDNColumn) t.string("encryptedBindDN").nullable().alter();
      if (hasBindDNIVColumn) t.string("bindDNIV").nullable().alter();
      if (hasBindDNTagColumn) t.string("bindDNTag").nullable().alter();

      if (!hasEncryptedLdapBindDNColum) t.binary("encryptedLdapBindDN");
      if (!hasEncryptedLdapBindPassColumn) t.binary("encryptedLdapBindPass");
      if (!hasEncryptedCertificateColumn) t.binary("encryptedLdapCaCertificate");
    });
  }

  initLogger();
  const superAdminDAL = superAdminDALFactory(knex);
  const envConfig = await getMigrationEnvConfig(superAdminDAL);
  const keyStore = inMemoryKeyStore();
  const { kmsService } = await getMigrationEncryptionServices({ envConfig, keyStore, db: knex });
  const orgEncryptionRingBuffer =
    createCircularCache<Awaited<ReturnType<(typeof kmsService)["createCipherPairWithDataKey"]>>>(25);

  const ldapConfigs = await knex(TableName.LdapConfig)
    .join(TableName.OrgBot, `${TableName.OrgBot}.orgId`, `${TableName.LdapConfig}.orgId`)
    .select(selectAllTableCols(TableName.LdapConfig))
    .select(
      knex.ref("encryptedSymmetricKey").withSchema(TableName.OrgBot),
      knex.ref("symmetricKeyIV").withSchema(TableName.OrgBot),
      knex.ref("symmetricKeyTag").withSchema(TableName.OrgBot),
      knex.ref("symmetricKeyKeyEncoding").withSchema(TableName.OrgBot)
    )
    .orderBy(`${TableName.OrgBot}.orgId` as "orgId");

  const updatedLdapConfigs = await Promise.all(
    ldapConfigs.map(
      async ({ encryptedSymmetricKey, symmetricKeyKeyEncoding, symmetricKeyTag, symmetricKeyIV, ...el }) => {
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

        const key = crypto
          .encryption()
          .symmetric()
          .decryptWithRootEncryptionKey({
            ciphertext: encryptedSymmetricKey,
            iv: symmetricKeyIV,
            tag: symmetricKeyTag,
            keyEncoding: symmetricKeyKeyEncoding as SecretKeyEncoding
          });

        const decryptedBindDN =
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore This will be removed in next cycle so ignore the ts missing error
          el.encryptedBindDN && el.bindDNIV && el.bindDNTag
            ? crypto.encryption().symmetric().decrypt({
                key,
                keySize: SymmetricKeySize.Bits256,
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore This will be removed in next cycle so ignore the ts missing error
                iv: el.bindDNIV,
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore This will be removed in next cycle so ignore the ts missing error
                tag: el.bindDNTag,
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore This will be removed in next cycle so ignore the ts missing error
                ciphertext: el.encryptedBindDN
              })
            : "";

        const decryptedBindPass =
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore This will be removed in next cycle so ignore the ts missing error
          el.encryptedBindPass && el.bindPassIV && el.bindPassTag
            ? crypto.encryption().symmetric().decrypt({
                key,
                keySize: SymmetricKeySize.Bits256,
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore This will be removed in next cycle so ignore the ts missing error
                iv: el.bindPassIV,
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore This will be removed in next cycle so ignore the ts missing error
                tag: el.bindPassTag,
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore This will be removed in next cycle so ignore the ts missing error
                ciphertext: el.encryptedBindPass
              })
            : "";

        const decryptedCertificate =
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore This will be removed in next cycle so ignore the ts missing error
          el.encryptedCACert && el.caCertIV && el.caCertTag
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
                ciphertext: el.encryptedCACert
              })
            : "";

        const encryptedLdapBindDN = orgKmsService.encryptor({
          plainText: Buffer.from(decryptedBindDN)
        }).cipherTextBlob;
        const encryptedLdapBindPass = orgKmsService.encryptor({
          plainText: Buffer.from(decryptedBindPass)
        }).cipherTextBlob;
        const encryptedLdapCaCertificate = orgKmsService.encryptor({
          plainText: Buffer.from(decryptedCertificate)
        }).cipherTextBlob;
        return { ...el, encryptedLdapBindPass, encryptedLdapBindDN, encryptedLdapCaCertificate };
      }
    )
  );

  for (let i = 0; i < updatedLdapConfigs.length; i += BATCH_SIZE) {
    // eslint-disable-next-line no-await-in-loop
    await knex(TableName.LdapConfig)
      .insert(updatedLdapConfigs.slice(i, i + BATCH_SIZE))
      .onConflict("id")
      .merge();
  }
  if (hasLdapConfigTable) {
    await knex.schema.alterTable(TableName.LdapConfig, (t) => {
      if (!hasEncryptedLdapBindPassColumn) t.binary("encryptedLdapBindPass").notNullable().alter();
      if (!hasEncryptedLdapBindDNColum) t.binary("encryptedLdapBindDN").notNullable().alter();
    });
  }
};

const reencryptOidcConfig = async (knex: Knex) => {
  const hasEncryptedOidcClientIdColumn = await knex.schema.hasColumn(TableName.OidcConfig, "encryptedOidcClientId");
  const hasEncryptedOidcClientSecretColumn = await knex.schema.hasColumn(
    TableName.OidcConfig,
    "encryptedOidcClientSecret"
  );

  const hasEncryptedClientIdColumn = await knex.schema.hasColumn(TableName.OidcConfig, "encryptedClientId");
  const hasClientIdIVColumn = await knex.schema.hasColumn(TableName.OidcConfig, "clientIdIV");
  const hasClientIdTagColumn = await knex.schema.hasColumn(TableName.OidcConfig, "clientIdTag");
  const hasEncryptedClientSecretColumn = await knex.schema.hasColumn(TableName.OidcConfig, "encryptedClientSecret");
  const hasClientSecretIVColumn = await knex.schema.hasColumn(TableName.OidcConfig, "clientSecretIV");
  const hasClientSecretTagColumn = await knex.schema.hasColumn(TableName.OidcConfig, "clientSecretTag");

  const hasOidcConfigTable = await knex.schema.hasTable(TableName.OidcConfig);

  if (hasOidcConfigTable) {
    await knex.schema.alterTable(TableName.OidcConfig, (t) => {
      if (hasEncryptedClientIdColumn) t.text("encryptedClientId").nullable().alter();
      if (hasClientIdIVColumn) t.string("clientIdIV").nullable().alter();
      if (hasClientIdTagColumn) t.string("clientIdTag").nullable().alter();
      if (hasEncryptedClientSecretColumn) t.text("encryptedClientSecret").nullable().alter();
      if (hasClientSecretIVColumn) t.string("clientSecretIV").nullable().alter();
      if (hasClientSecretTagColumn) t.string("clientSecretTag").nullable().alter();

      if (!hasEncryptedOidcClientIdColumn) t.binary("encryptedOidcClientId");
      if (!hasEncryptedOidcClientSecretColumn) t.binary("encryptedOidcClientSecret");
    });
  }

  initLogger();
  const superAdminDAL = superAdminDALFactory(knex);
  const envConfig = await getMigrationEnvConfig(superAdminDAL);
  const keyStore = inMemoryKeyStore();
  const { kmsService } = await getMigrationEncryptionServices({ envConfig, keyStore, db: knex });
  const orgEncryptionRingBuffer =
    createCircularCache<Awaited<ReturnType<(typeof kmsService)["createCipherPairWithDataKey"]>>>(25);

  const oidcConfigs = await knex(TableName.OidcConfig)
    .join(TableName.OrgBot, `${TableName.OrgBot}.orgId`, `${TableName.OidcConfig}.orgId`)
    .select(selectAllTableCols(TableName.OidcConfig))
    .select(
      knex.ref("encryptedSymmetricKey").withSchema(TableName.OrgBot),
      knex.ref("symmetricKeyIV").withSchema(TableName.OrgBot),
      knex.ref("symmetricKeyTag").withSchema(TableName.OrgBot),
      knex.ref("symmetricKeyKeyEncoding").withSchema(TableName.OrgBot)
    )
    .orderBy(`${TableName.OrgBot}.orgId` as "orgId");

  const updatedOidcConfigs = await Promise.all(
    oidcConfigs.map(
      async ({ encryptedSymmetricKey, symmetricKeyKeyEncoding, symmetricKeyTag, symmetricKeyIV, ...el }) => {
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

        const key = crypto
          .encryption()
          .symmetric()
          .decryptWithRootEncryptionKey({
            ciphertext: encryptedSymmetricKey,
            iv: symmetricKeyIV,
            tag: symmetricKeyTag,
            keyEncoding: symmetricKeyKeyEncoding as SecretKeyEncoding
          });

        const decryptedClientId =
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore This will be removed in next cycle so ignore the ts missing error
          el.encryptedClientId && el.clientIdIV && el.clientIdTag
            ? crypto.encryption().symmetric().decrypt({
                key,
                keySize: SymmetricKeySize.Bits256,
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore This will be removed in next cycle so ignore the ts missing error
                iv: el.clientIdIV,
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore This will be removed in next cycle so ignore the ts missing error
                tag: el.clientIdTag,
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore This will be removed in next cycle so ignore the ts missing error
                ciphertext: el.encryptedClientId
              })
            : "";

        const decryptedClientSecret =
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore This will be removed in next cycle so ignore the ts missing error
          el.encryptedClientSecret && el.clientSecretIV && el.clientSecretTag
            ? crypto.encryption().symmetric().decrypt({
                key,
                keySize: SymmetricKeySize.Bits256,
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore This will be removed in next cycle so ignore the ts missing error
                iv: el.clientSecretIV,
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore This will be removed in next cycle so ignore the ts missing error
                tag: el.clientSecretTag,
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore This will be removed in next cycle so ignore the ts missing error
                ciphertext: el.encryptedClientSecret
              })
            : "";

        const encryptedOidcClientId = orgKmsService.encryptor({
          plainText: Buffer.from(decryptedClientId)
        }).cipherTextBlob;
        const encryptedOidcClientSecret = orgKmsService.encryptor({
          plainText: Buffer.from(decryptedClientSecret)
        }).cipherTextBlob;
        return { ...el, encryptedOidcClientId, encryptedOidcClientSecret };
      }
    )
  );

  for (let i = 0; i < updatedOidcConfigs.length; i += BATCH_SIZE) {
    // eslint-disable-next-line no-await-in-loop
    await knex(TableName.OidcConfig)
      .insert(updatedOidcConfigs.slice(i, i + BATCH_SIZE))
      .onConflict("id")
      .merge();
  }
  if (hasOidcConfigTable) {
    await knex.schema.alterTable(TableName.OidcConfig, (t) => {
      if (!hasEncryptedOidcClientIdColumn) t.binary("encryptedOidcClientId").notNullable().alter();
      if (!hasEncryptedOidcClientSecretColumn) t.binary("encryptedOidcClientSecret").notNullable().alter();
    });
  }
};

export async function up(knex: Knex): Promise<void> {
  await reencryptSamlConfig(knex);
  await reencryptLdapConfig(knex);
  await reencryptOidcConfig(knex);
}

const dropSamlConfigColumns = async (knex: Knex) => {
  const hasEncryptedEntrypointColumn = await knex.schema.hasColumn(TableName.SamlConfig, "encryptedSamlEntryPoint");
  const hasEncryptedIssuerColumn = await knex.schema.hasColumn(TableName.SamlConfig, "encryptedSamlIssuer");
  const hasEncryptedCertificateColumn = await knex.schema.hasColumn(TableName.SamlConfig, "encryptedSamlCertificate");
  const hasSamlConfigTable = await knex.schema.hasTable(TableName.SamlConfig);

  if (hasSamlConfigTable) {
    await knex.schema.alterTable(TableName.SamlConfig, (t) => {
      if (hasEncryptedEntrypointColumn) t.dropColumn("encryptedSamlEntryPoint");
      if (hasEncryptedIssuerColumn) t.dropColumn("encryptedSamlIssuer");
      if (hasEncryptedCertificateColumn) t.dropColumn("encryptedSamlCertificate");
    });
  }
};

const dropLdapConfigColumns = async (knex: Knex) => {
  const hasEncryptedBindDN = await knex.schema.hasColumn(TableName.LdapConfig, "encryptedLdapBindDN");
  const hasEncryptedBindPass = await knex.schema.hasColumn(TableName.LdapConfig, "encryptedLdapBindPass");
  const hasEncryptedCertificateColumn = await knex.schema.hasColumn(TableName.LdapConfig, "encryptedLdapCaCertificate");
  const hasLdapConfigTable = await knex.schema.hasTable(TableName.LdapConfig);

  if (hasLdapConfigTable) {
    await knex.schema.alterTable(TableName.LdapConfig, (t) => {
      if (hasEncryptedBindDN) t.dropColumn("encryptedLdapBindDN");
      if (hasEncryptedBindPass) t.dropColumn("encryptedLdapBindPass");
      if (hasEncryptedCertificateColumn) t.dropColumn("encryptedLdapCaCertificate");
    });
  }
};

const dropOidcConfigColumns = async (knex: Knex) => {
  const hasEncryptedClientId = await knex.schema.hasColumn(TableName.OidcConfig, "encryptedOidcClientId");
  const hasEncryptedClientSecret = await knex.schema.hasColumn(TableName.OidcConfig, "encryptedOidcClientSecret");
  const hasOidcConfigTable = await knex.schema.hasTable(TableName.OidcConfig);

  if (hasOidcConfigTable) {
    await knex.schema.alterTable(TableName.OidcConfig, (t) => {
      if (hasEncryptedClientId) t.dropColumn("encryptedOidcClientId");
      if (hasEncryptedClientSecret) t.dropColumn("encryptedOidcClientSecret");
    });
  }
};

export async function down(knex: Knex): Promise<void> {
  await dropSamlConfigColumns(knex);
  await dropLdapConfigColumns(knex);
  await dropOidcConfigColumns(knex);
}
