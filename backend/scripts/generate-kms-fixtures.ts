/* eslint-disable no-console */
// Pins the KMS wire format before KMS Core replaces src/services/kms. Runs the legacy kmsServiceFactory against an
// empty Postgres database and records every stored and returned byte layout the new code must keep reading.
//
//   DB_CONNECTION_URI=postgres://... ENCRYPTION_KEY=4bnfe4e407b8921c104518903515b218 AUTH_SECRET=x \
//     npx tsx scripts/generate-kms-fixtures.ts
//
// The database must be empty; the script migrates it. One-shot: it is deleted with src/services/kms.
import "tsx/cjs";

import { writeFileSync } from "node:fs";
import path from "node:path";

import knex from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { createPlatformFactories } from "@app/domains/lib/testing/integration/factories";
import { initializeHsmModule } from "@app/ee/services/hsm/hsm-fns";
import { hsmServiceFactory } from "@app/ee/services/hsm/hsm-service";
import { crypto } from "@app/lib/crypto/cryptography";
import { internalKmsDALFactory } from "@app/services/kms/internal-kms-dal";
import { internalKmsKeyVersionDALFactory } from "@app/services/kms/internal-kms-key-version-dal";
import { kmsKekHistoryDALFactory } from "@app/services/kms/kms-kek-history-dal";
import { kmskeyDALFactory } from "@app/services/kms/kms-key-dal";
import { kmsLegacyEncryptionKeyDALFactory } from "@app/services/kms/kms-legacy-encryption-key-dal";
import { kmsRootConfigDALFactory } from "@app/services/kms/kms-root-config-dal";
import { kmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { orgDALFactory } from "@app/services/org/org-dal";
import { projectDALFactory } from "@app/services/project/project-dal";

const OUTPUT = path.join(__dirname, "../src/domains/platform/kms-core/ce/testing/fixtures/kms-wire-format.json");

const b64 = (buffer: Buffer | null | undefined) => (buffer ? Buffer.from(buffer).toString("base64") : null);

const rowToJson = (row: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(row).map(([key, value]) => {
      if (Buffer.isBuffer(value)) return [key, { $buffer: value.toString("base64") }];
      if (value instanceof Date) return [key, { $date: value.toISOString() }];
      return [key, value];
    })
  );

const main = async () => {
  const connection = process.env.DB_CONNECTION_URI;
  if (!connection) throw new Error("Set DB_CONNECTION_URI to an empty database");
  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!encryptionKey) throw new Error("Set ENCRYPTION_KEY");

  const db = knex({ client: "pg", connection }) as unknown as TDbClient;
  // ormify reads replicaNode/primaryNode on the client; a single database answers both.
  Object.assign(db, { replicaNode: () => db, primaryNode: () => db });

  await db.migrate.latest({
    directory: path.join(__dirname, "../src/db/migrations"),
    extension: "ts",
    loadExtensions: [".ts"],
    tableName: "infisical_migrations"
  });

  const hsmModule = initializeHsmModule({ isHsmConfigured: false, HSM_LIB_PATH: undefined });
  const hsmService = hsmServiceFactory({
    hsmModule: hsmModule.getModule(),
    envConfig: {
      isHsmConfigured: false,
      HSM_PIN: undefined,
      HSM_SLOT: 0,
      HSM_LIB_PATH: undefined,
      HSM_KEY_LABEL: undefined
    }
  });

  const keyStore = {
    getItem: async () => null,
    setItemWithExpiry: async () => "OK",
    deleteItem: async () => 1
  };

  const kms = kmsServiceFactory({
    kmsRootConfigDAL: kmsRootConfigDALFactory(db),
    kmsLegacyEncryptionKeyDAL: kmsLegacyEncryptionKeyDALFactory(db),
    kmsKekHistoryDAL: kmsKekHistoryDALFactory(db),
    kmsDAL: kmskeyDALFactory(db),
    internalKmsDAL: internalKmsDALFactory(db),
    internalKmsKeyVersionDAL: internalKmsKeyVersionDALFactory(db),
    orgDAL: orgDALFactory(db),
    projectDAL: projectDALFactory(db),
    hsmService,
    keyStore: keyStore as never,
    envConfig: { ENCRYPTION_KEY: encryptionKey, ROOT_ENCRYPTION_KEY: undefined }
  });

  await kms.startService({ rootKmsConfigEncryptionStrategy: null, isHsmConfigured: false });

  const factories = createPlatformFactories(db);
  const tenant = await factories.tenant();
  const orgId = tenant.org.id;
  const projectId = tenant.project.id;

  const plain = (label: string) => Buffer.from(`kms-core fixture: ${label}`, "utf8");

  const orgCipher = await kms.createCipherPairWithDataKey({ type: KmsDataKey.Organization, orgId });
  const orgDataKeyBlob = orgCipher.encryptor({ plainText: plain("org data key") }).cipherTextBlob;
  const projectCipher = await kms.createCipherPairWithDataKey({ type: KmsDataKey.SecretManager, projectId });
  const projectDataKeyBlob = projectCipher.encryptor({ plainText: plain("project data key") }).cipherTextBlob;
  const blindIndex = await projectCipher.generateSecretBlindIndex(Buffer.from("fixture-value", "utf8"));

  const cmek = await kms.generateKmsKey({ orgId, projectId, isReserved: false, name: "fixture-cmek" });
  const v01Blob = (await (await kms.encryptWithKmsKey({ kmsId: cmek.id }))({ plainText: plain("v01") })).cipherTextBlob;
  await kms.rotateKmsKey(cmek.id);
  const v02Blob = (await (await kms.encryptWithKmsKey({ kmsId: cmek.id }))({ plainText: plain("v02") })).cipherTextBlob;

  const wrapLabel = "fixture-session|v1";
  const wrapKeyMaterial = crypto.randomBytes(32);
  const wrappedKey = await kms.wrapKey({ projectId, label: wrapLabel, key: wrapKeyMaterial });

  const rootKeyBlob = kms.encryptWithRootKey()(plain("root key"));
  const inputKey = crypto.randomBytes(32);
  const inputKeyBlob = (await kms.encryptWithInputKey({ key: inputKey }))({
    plainText: plain("input key")
  }).cipherTextBlob;
  const backup = await kms.getProjectKeyBackup(projectId);

  const select = async (table: string, where: Record<string, unknown>) =>
    (await db(table).where(where).select("*")).map(rowToJson);

  const org = await db(TableName.Organization).where({ id: orgId }).first();
  const project = await db(TableName.Project).where({ id: projectId }).first();
  const keyIds = [org.kmsDefaultKeyId, project.kmsSecretManagerKeyId, cmek.id];

  const fixture = {
    generatedBy: "scripts/generate-kms-fixtures.ts",
    env: { ENCRYPTION_KEY: encryptionKey },
    rows: {
      kmsRootConfig: await select(TableName.KmsServerRootConfig, {}),
      kmsLegacyEncryptionKeys: await select(TableName.KmsLegacyEncryptionKey, {}),
      kmsKekHistory: await select(TableName.KmsKekHistory, {}),
      organization: {
        id: orgId,
        kmsDefaultKeyId: org.kmsDefaultKeyId,
        kmsEncryptedDataKey: b64(org.kmsEncryptedDataKey)
      },
      project: {
        id: projectId,
        orgId,
        kmsSecretManagerKeyId: project.kmsSecretManagerKeyId,
        kmsSecretManagerEncryptedDataKey: b64(project.kmsSecretManagerEncryptedDataKey)
      },
      kmsKeys: (await db(TableName.KmsKey).whereIn("id", keyIds).select("*")).map(rowToJson),
      internalKms: (await db(TableName.InternalKms).whereIn("kmsKeyId", keyIds).select("*")).map(rowToJson),
      internalKmsKeyVersions: (
        await db(TableName.InternalKmsKeyVersion)
          .join(
            TableName.InternalKms,
            `${TableName.InternalKms}.id`,
            `${TableName.InternalKmsKeyVersion}.internalKmsId`
          )
          .whereIn(`${TableName.InternalKms}.kmsKeyId`, keyIds)
          .select(`${TableName.InternalKmsKeyVersion}.*`)
      ).map(rowToJson)
    },
    vectors: {
      orgDataKey: { orgId, plainText: b64(plain("org data key")), cipherTextBlob: b64(orgDataKeyBlob) },
      projectDataKey: {
        projectId,
        plainText: b64(plain("project data key")),
        cipherTextBlob: b64(projectDataKeyBlob),
        blindIndexInput: "fixture-value",
        blindIndex
      },
      cmek: {
        kmsId: cmek.id,
        v01: { plainText: b64(plain("v01")), cipherTextBlob: b64(v01Blob) },
        v02: { plainText: b64(plain("v02")), cipherTextBlob: b64(v02Blob) }
      },
      wrappedKey: { projectId, label: wrapLabel, key: b64(wrapKeyMaterial), wrapped: b64(wrappedKey) },
      rootKey: { plainText: b64(plain("root key")), cipherTextBlob: b64(rootKeyBlob) },
      inputKey: { key: b64(inputKey), plainText: b64(plain("input key")), cipherTextBlob: b64(inputKeyBlob) },
      backup: { projectId, secretManager: backup.secretManager },
      cookieSigningKey: kms.getCookieSigningKey(),
      kekLabel: kms.getCurrentKekLabel()
    }
  };

  writeFileSync(OUTPUT, `${JSON.stringify(fixture, null, 2)}\n`);
  console.log(`Wrote ${OUTPUT}`);
  await db.destroy();
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
