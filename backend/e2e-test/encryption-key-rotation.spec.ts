import { beforeAll, describe, expect, it } from "vitest";

import { isHsmActiveAndEnabled } from "@app/ee/services/hsm/hsm-fns";
import { getConfig, initEnvConfig, TEnvConfig } from "@app/lib/config/env";
import { TCronJobFactory } from "@app/lib/cron/cron-job";
import { crypto } from "@app/lib/crypto/cryptography";
import { InternalServerError } from "@app/lib/errors";
import { initLogger, logger } from "@app/lib/logger";
import { generateRootEncryptionKey } from "@app/services/encryption-key-rotation/encryption-key-rotation-fns";
import { encryptionKeyRotationServiceFactory } from "@app/services/encryption-key-rotation/encryption-key-rotation-service";
import { internalKmsDALFactory } from "@app/services/kms/internal-kms-dal";
import { internalKmsKeyVersionDALFactory } from "@app/services/kms/internal-kms-key-version-dal";
import { kmsImportKeyMaterialTokenDALFactory } from "@app/services/kms/kms-import-key-material-token-dal";
import { KMS_ROOT_CONFIG_UUID } from "@app/services/kms/kms-fns";
import { kmsKekHistoryDALFactory } from "@app/services/kms/kms-kek-history-dal";
import { kmskeyDALFactory } from "@app/services/kms/kms-key-dal";
import { kmsKeyImportMetaDALFactory } from "@app/services/kms/kms-key-import-meta-dal";
import { kmsLegacyEncryptionKeyDALFactory } from "@app/services/kms/kms-legacy-encryption-key-dal";
import { kmsRootConfigDALFactory } from "@app/services/kms/kms-root-config-dal";
import { kmsServiceFactory } from "@app/services/kms/kms-service";
import { orgDALFactory } from "@app/services/org/org-dal";
import { projectDALFactory } from "@app/services/project/project-dal";

// These tests exercise the boot path ($resolveRootKey / $promoteRotation), which the API layer never
// calls: promotion happens only when an *instance* starts with a key that matches a staged row. Each
// "instance" below is a fresh KMS service whose env carries a different key, booted against the same
// database the test server is running on. The tests form one saga — each builds on the state the
// previous one left — and the file gets a freshly migrated database from the environment setup.

// Simulates a separate instance booting with `key` as its configured encryption key.
const bootInstanceWithKey = async (key: string) => {
  const appCfg = getConfig();
  // Mirror initEnvConfig's relocation: on FIPS the operator's key lives in ROOT_ENCRYPTION_KEY and
  // ENCRYPTION_KEY is deleted; off FIPS it stays in ENCRYPTION_KEY.
  const envConfig: TEnvConfig = crypto.isFipsModeEnabled()
    ? { ...appCfg, ENCRYPTION_KEY: undefined, ROOT_ENCRYPTION_KEY: key }
    : { ...appCfg, ENCRYPTION_KEY: key };

  const kmsRootConfigDAL = kmsRootConfigDALFactory(testDb);
  const service = kmsServiceFactory({
    kmsRootConfigDAL,
    kmsLegacyEncryptionKeyDAL: kmsLegacyEncryptionKeyDALFactory(testDb),
    kmsKekHistoryDAL: kmsKekHistoryDALFactory(testDb),
    kmsDAL: kmskeyDALFactory(testDb),
    internalKmsDAL: internalKmsDALFactory(testDb),
    internalKmsKeyVersionDAL: internalKmsKeyVersionDALFactory(testDb),
    kmsImportKeyMaterialTokenDAL: kmsImportKeyMaterialTokenDALFactory(testDb),
    kmsKeyImportMetaDAL: kmsKeyImportMetaDALFactory(testDb),
    orgDAL: orgDALFactory(testDb),
    projectDAL: projectDALFactory(testDb),
    hsmService: testHsmService,
    // startService never touches the key store; only the factory's dependency type requires it.
    keyStore: {
      getItem: async () => null,
      setItemWithExpiry: async () => "OK" as const,
      deleteItem: async () => 0
    },
    envConfig
  });

  const hsmStatus = await isHsmActiveAndEnabled({ hsmService: testHsmService, kmsRootConfigDAL });
  await service.startService(hsmStatus);
  return service;
};

const currentEnvKey = () => {
  const cfg = getConfig();
  const key = crypto.isFipsModeEnabled() ? cfg.ROOT_ENCRYPTION_KEY : cfg.ENCRYPTION_KEY;
  if (!key) throw new Error("test environment has no encryption key configured");
  return key;
};

describe("encryption key rotation: boot-time promotion", () => {
  const kekHistoryDAL = kmsKekHistoryDALFactory(testDb);

  // The rotation service's cron is only used by init(), which these tests never call.
  const cronJobStub: TCronJobFactory = {
    register: () => undefined,
    start: () => {},
    stop: async () => {}
  };

  beforeAll(async () => {
    // Spec files run in a separate module graph from the test server, so the env config and the
    // cryptography module must be initialized here as well (same process env, same result).
    initLogger();
    await initEnvConfig(testHsmService, testKmsRootConfigDAL, testSuperAdminDAL, logger);
  });

  let originalLabel: string;
  let rotationService: ReturnType<typeof encryptionKeyRotationServiceFactory>;
  let firstRotation: { key: string; label: string };
  let secondLabel: string;
  let probeCiphertext: Buffer;

  it("boots an instance on the configured key without promoting anything", async () => {
    const sentinel = await testKmsRootConfigDAL.findById(KMS_ROOT_CONFIG_UUID);
    if (!sentinel.kekLabel) throw new Error("expected the bootstrap to have labeled the sentinel");
    expect(sentinel.activatedAt).toBeTruthy();
    originalLabel = sentinel.kekLabel;

    const instance = await bootInstanceWithKey(currentEnvKey());
    expect(instance.getCurrentKekLabel()).toBe(originalLabel);

    // The server's own rotation service is encapsulated inside the route plugin, so operate through
    // an equivalent one built on this instance.
    rotationService = encryptionKeyRotationServiceFactory({
      kmsService: instance,
      kmsRootConfigDAL: testKmsRootConfigDAL,
      kmsKekHistoryDAL: kekHistoryDAL,
      envConfig: getConfig(),
      cronJob: cronJobStub
    });

    expect(await testKmsRootConfigDAL.findAll()).toHaveLength(1);
    probeCiphertext = instance.encryptWithRootKey()(Buffer.from("root-key-probe"));
  });

  it("promotes the staged key when an instance boots with it", async () => {
    firstRotation = await rotationService.createRotation({});

    const staged = await testKmsRootConfigDAL.findStaged();
    expect(staged).toHaveLength(1);
    expect(staged[0].kekLabel).toBe(firstRotation.label);

    const instance = await bootInstanceWithKey(firstRotation.key);
    expect(instance.getCurrentKekLabel()).toBe(firstRotation.label);

    // The sentinel now wraps the same root key with the new key — proven by decrypting data the
    // pre-rotation instance encrypted.
    expect(instance.decryptWithRootKey()(probeCiphertext).toString()).toBe("root-key-probe");

    const sentinel = await testKmsRootConfigDAL.findById(KMS_ROOT_CONFIG_UUID);
    expect(sentinel.kekLabel).toBe(firstRotation.label);
    expect(sentinel.activatedAt).toBeTruthy();
    expect(sentinel.supersededAt).toBeFalsy();

    // The previous key was retained, not deleted.
    const retained = await testKmsRootConfigDAL.findRetained();
    expect(retained).toHaveLength(1);
    expect(retained[0].kekLabel).toBe(originalLabel);
    expect(retained[0].supersededAt).toBeTruthy();

    expect(await testKmsRootConfigDAL.findStaged()).toHaveLength(0);

    const history = await kekHistoryDAL.findHistoryPage({ offset: 0, limit: 100 });
    const byLabel = new Map(history.map((row) => [row.kekLabel, row]));
    expect(byLabel.get(originalLabel)?.supersededAt).toBeTruthy();
    expect(byLabel.get(originalLabel)?.retiredAt).toBeFalsy();
    expect(byLabel.get(firstRotation.label)?.supersededAt).toBeFalsy();
    expect(byLabel.get(firstRotation.label)?.retiredAt).toBeFalsy();
  });

  it("resolves the retained key for a straggler and stamps lastResolvedAt", async () => {
    const instance = await bootInstanceWithKey(currentEnvKey());
    expect(instance.getCurrentKekLabel()).toBe(originalLabel);
    expect(instance.decryptWithRootKey()(probeCiphertext).toString()).toBe("root-key-probe");

    const retained = await testKmsRootConfigDAL.findRetained();
    expect(retained).toHaveLength(1);
    expect(retained[0].kekLabel).toBe(originalLabel);
    expect(retained[0].lastResolvedAt).toBeTruthy();

    // The active key did not change.
    const sentinel = await testKmsRootConfigDAL.findById(KMS_ROOT_CONFIG_UUID);
    expect(sentinel.kekLabel).toBe(firstRotation.label);
  });

  it("retires the oldest key on the next promotion and strands instances still on it", async () => {
    const secondRotation = await rotationService.createRotation({});
    secondLabel = secondRotation.label;
    expect(secondRotation.removesExpiringKey?.label).toBe(originalLabel);

    const instance = await bootInstanceWithKey(secondRotation.key);
    expect(instance.getCurrentKekLabel()).toBe(secondLabel);
    expect(instance.decryptWithRootKey()(probeCiphertext).toString()).toBe("root-key-probe");

    // The first key's retained row is gone; only the just-superseded key is retained now.
    const retained = await testKmsRootConfigDAL.findRetained();
    expect(retained).toHaveLength(1);
    expect(retained[0].kekLabel).toBe(firstRotation.label);

    const history = await kekHistoryDAL.findHistoryPage({ offset: 0, limit: 100 });
    const byLabel = new Map(history.map((row) => [row.kekLabel, row]));
    expect(byLabel.get(originalLabel)?.retiredAt).toBeTruthy();
    expect(byLabel.get(firstRotation.label)?.supersededAt).toBeTruthy();
    expect(byLabel.get(firstRotation.label)?.retiredAt).toBeFalsy();
    expect(byLabel.get(secondLabel)?.supersededAt).toBeFalsy();

    // An instance still on the first key can no longer boot.
    await expect(bootInstanceWithKey(currentEnvKey())).rejects.toThrowError(InternalServerError);
  });

  it("refuses to boot with an unknown key and names the known labels", async () => {
    const wrongKey = generateRootEncryptionKey(crypto.isFipsModeEnabled());
    const err: unknown = await bootInstanceWithKey(wrongKey).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(InternalServerError);
    const { message } = err as Error;
    expect(message).toContain("does not decrypt this database's root key");
    expect(message).toContain(secondLabel);
  });
});
