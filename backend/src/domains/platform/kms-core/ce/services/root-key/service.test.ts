import { EntityNotFoundError, RuleViolationError } from "@app/domains/lib/errors";

import { KekHistoryEntry } from "../../models/kek-history-entry";
import { RootKey } from "../../models/root-key";
import {
  KMS_ROOT_CONFIG_UUID,
  RootKeyConfig,
  RootKeyEncryptionStrategy,
  TRootKeyConfigRecord
} from "../../models/root-key-config";
import { InMemoryKmsCoreStores } from "../../testing/in-memory-kms-core-stores";
import { bootRootKeyService, fakeHsm, rootKeyTestEnv } from "../../testing/root-key-fixture";
import { KmsRootKeyService } from "./service";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

const RETENTION_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
const RETAINED_ID = "11111111-1111-1111-1111-111111111111";

const retainedRow = (overrides: Partial<TRootKeyConfigRecord> = {}): TRootKeyConfigRecord => ({
  id: RETAINED_ID,
  encryptedRootKey: Buffer.alloc(32, 1),
  encryptionStrategy: "SOFTWARE",
  kekLabel: "a".repeat(32),
  supersededAt: new Date(Date.now() - (RETENTION_DAYS + 1) * DAY_MS),
  lastResolvedAt: null,
  activatedAt: new Date(Date.now() - (RETENTION_DAYS + 2) * DAY_MS),
  createdAt: new Date(Date.now() - (RETENTION_DAYS + 2) * DAY_MS),
  updatedAt: new Date(Date.now() - (RETENTION_DAYS + 1) * DAY_MS),
  ...overrides
});

// The cleanup reads its candidates first and re-reads each one under the root key lock. `snapshot` is what that
// first read returns; `stored` is the row the locked re-read finds, which can have changed in between.
const buildCleanup = async ({
  snapshot,
  stored
}: {
  snapshot?: TRootKeyConfigRecord;
  stored: TRootKeyConfigRecord;
}) => {
  const memory = new InMemoryKmsCoreStores();
  await memory.rootKeyConfigStore.insert(RootKeyConfig.restore(stored));
  if (snapshot) {
    vi.spyOn(memory.rootKeyConfigStore, "findAll").mockResolvedValue([RootKeyConfig.restore(snapshot)]);
  }
  const service = new KmsRootKeyService(
    memory.transactionRunner,
    RootKey.generate(),
    rootKeyTestEnv({ KMS_ROOT_KEY_RETENTION_DAYS: RETENTION_DAYS }),
    () => false,
    undefined
  );
  return { service, isRetained: async () => Boolean(await memory.rootKeyConfigStore.findById(RETAINED_ID)) };
};

describe("KmsRootKeyService root key", () => {
  test("should encrypt and decrypt with the root key it was built with", async () => {
    // Setup
    const { service } = await bootRootKeyService();

    // Action
    const blob = service.encryptWithRootKey()(Buffer.from("kept"));

    // Assert
    expect(service.decryptWithRootKey()(blob).toString()).toBe("kept");
  });

  test("should return a stable cookie signing key derived from the root key", async () => {
    // Setup
    const { service, rootKey } = await bootRootKeyService();

    // Action
    const key = service.getCookieSigningKey();

    // Assert
    expect(key).toBe(rootKey.cookieSigningKey());
  });
});

describe("KmsRootKeyService.updateEncryptionStrategy", () => {
  test("should refuse a change while a rotation is staged and change nothing", async () => {
    // Setup
    const configured = { value: false };
    const { service, memory } = await bootRootKeyService({
      rootKeyWrapper: fakeHsm({ entitled: true, configured })
    });
    configured.value = true;
    await service.createRotation({});
    const before = await memory.rootKeyConfigStore.findById(KMS_ROOT_CONFIG_UUID);

    // Action
    const result = service.updateEncryptionStrategy(RootKeyEncryptionStrategy.HSM);

    // Assert
    await expect(result).rejects.toThrow("An encryption key rotation is still in progress");
    expect((await memory.rootKeyConfigStore.findById(KMS_ROOT_CONFIG_UUID))?.toJSON()).toEqual(before?.toJSON());
  });

  test("should refuse a switch to HSM when the instance is not entitled, and change nothing", async () => {
    // Setup
    const configured = { value: false };
    const { service, memory } = await bootRootKeyService({
      rootKeyWrapper: fakeHsm({ entitled: false, configured })
    });
    configured.value = true;
    const before = await memory.rootKeyConfigStore.findById(KMS_ROOT_CONFIG_UUID);

    // Action
    const result = service.updateEncryptionStrategy(RootKeyEncryptionStrategy.HSM);

    // Assert
    await expect(result).rejects.toThrow("Your license does not include HSM integration");
    expect((await memory.rootKeyConfigStore.findById(KMS_ROOT_CONFIG_UUID))?.toJSON()).toEqual(before?.toJSON());
  });

  test("should re-wrap the same root key when switching to HSM", async () => {
    // Setup
    const configured = { value: false };
    const { service, memory } = await bootRootKeyService({
      rootKeyWrapper: fakeHsm({ entitled: true, configured })
    });
    configured.value = true;
    const blob = service.encryptWithRootKey()(Buffer.from("kept"));

    // Action
    await service.updateEncryptionStrategy(RootKeyEncryptionStrategy.HSM);

    // Assert
    const active = await memory.rootKeyConfigStore.findById(KMS_ROOT_CONFIG_UUID);
    expect(active?.strategy).toBe(RootKeyEncryptionStrategy.HSM);
    expect(active?.kekLabel).toBeNull();
    expect(service.decryptWithRootKey()(blob).toString()).toBe("kept");
  });

  test("should do nothing when the strategy is already the requested one", async () => {
    // Setup
    const { service, memory } = await bootRootKeyService();
    const before = await memory.rootKeyConfigStore.findById(KMS_ROOT_CONFIG_UUID);

    // Action
    await service.updateEncryptionStrategy(RootKeyEncryptionStrategy.Software);

    // Assert
    expect((await memory.rootKeyConfigStore.findById(KMS_ROOT_CONFIG_UUID))?.toJSON()).toEqual(before?.toJSON());
  });

  test("should refuse a switch to software when no encryption key is configured", async () => {
    // Setup
    const { service } = await bootRootKeyService({
      env: { ENCRYPTION_KEY: undefined, isHsmConfigured: true },
      rootKeyWrapper: fakeHsm({ entitled: true })
    });

    // Action
    const result = service.updateEncryptionStrategy(RootKeyEncryptionStrategy.Software);

    // Assert
    await expect(result).rejects.toThrow("before trying to update the encryption strategy to software mode");
  });

  test("should refuse a change when the active root key was written with another encryption key label", async () => {
    // Setup
    const configured = { value: false };
    const { service, memory } = await bootRootKeyService({
      rootKeyWrapper: fakeHsm({ entitled: true, configured })
    });
    configured.value = true;
    const active = (await memory.rootKeyConfigStore.findById(KMS_ROOT_CONFIG_UUID)) as RootKeyConfig;
    await memory.rootKeyConfigStore.save(RootKeyConfig.restore({ ...active.toJSON(), kekLabel: "b".repeat(32) }));

    // Action
    const result = service.updateEncryptionStrategy(RootKeyEncryptionStrategy.HSM);

    // Assert
    await expect(result).rejects.toThrow("Restart it with the current encryption key");
  });
});

describe("KmsRootKeyService.listEncryptionStrategies", () => {
  test("should offer software as the enabled strategy when only an encryption key is set", async () => {
    // Setup
    const { service } = await bootRootKeyService();

    // Action
    const { strategies } = await service.listEncryptionStrategies();

    // Assert
    expect(strategies).toEqual([{ enabled: true, strategy: RootKeyEncryptionStrategy.Software }]);
  });

  test("should offer HSM too when it is configured", async () => {
    // Setup
    const { service } = await bootRootKeyService({ env: { isHsmConfigured: true } });

    // Action
    const { strategies } = await service.listEncryptionStrategies();

    // Assert
    expect(strategies).toEqual([
      { enabled: true, strategy: RootKeyEncryptionStrategy.Software },
      { enabled: false, strategy: RootKeyEncryptionStrategy.HSM }
    ]);
  });

  test("should refuse when there is no root config", async () => {
    // Setup
    const memory = new InMemoryKmsCoreStores();
    const service = new KmsRootKeyService(
      memory.transactionRunner,
      RootKey.generate(),
      rootKeyTestEnv(),
      () => false,
      undefined
    );

    // Action
    const result = service.listEncryptionStrategies();

    // Assert
    await expect(result).rejects.toBeInstanceOf(EntityNotFoundError);
    await expect(result).rejects.toThrow("KMS root configuration not found");
  });
});

describe("KmsRootKeyService.createRotation", () => {
  test("should stage a key, return its value once and leave the active key untouched", async () => {
    // Setup
    const { service, memory } = await bootRootKeyService();
    const before = await memory.rootKeyConfigStore.findById(KMS_ROOT_CONFIG_UUID);

    // Action
    const created = await service.createRotation({});

    // Assert
    const status = await service.getRootKey();
    expect(created.key).toHaveLength(32);
    expect(status.staged?.label).toBe(created.label);
    expect((await memory.rootKeyConfigStore.findById(KMS_ROOT_CONFIG_UUID))?.toJSON()).toEqual(before?.toJSON());
  });

  test("should generate a base64 256-bit value under FIPS", async () => {
    // Setup
    const { service } = await bootRootKeyService({
      env: { ENCRYPTION_KEY: undefined, ROOT_ENCRYPTION_KEY: Buffer.alloc(32, 3).toString("base64") },
      isFipsEnabled: () => true
    });

    // Action
    const created = await service.createRotation({});

    // Assert
    expect(Buffer.from(created.key, "base64")).toHaveLength(32);
  });

  test("should refuse a second rotation while one is staged, and keep the first", async () => {
    // Setup
    const { service } = await bootRootKeyService();
    const first = await service.createRotation({});

    // Action
    const result = service.createRotation({});

    // Assert
    await expect(result).rejects.toBeInstanceOf(RuleViolationError);
    await expect(result).rejects.toThrow("A key is already staged");
    expect((await service.getRootKey()).staged?.label).toBe(first.label);
  });

  test("should replace the staged key when replaceStaged is set", async () => {
    // Setup
    const { service, memory } = await bootRootKeyService();
    const first = await service.createRotation({});

    // Action
    const second = await service.createRotation({ replaceStaged: true });

    // Assert
    const staged = (await memory.rootKeyConfigStore.findAll()).filter((row) => row.isStaged);
    expect(staged.map((row) => row.kekLabel)).toEqual([second.label]);
    expect(second.label).not.toBe(first.label);
  });

  test("should refuse to rotate an HSM-wrapped root key", async () => {
    // Setup
    const { service } = await bootRootKeyService({
      env: { ENCRYPTION_KEY: undefined, isHsmConfigured: true },
      rootKeyWrapper: fakeHsm({ entitled: true })
    });

    // Action
    const result = service.createRotation({});

    // Assert
    await expect(result).rejects.toThrow("wraps its root key with an HSM");
  });

  test("should name the retained key that applying the new key removes", async () => {
    // Setup
    const { service, memory } = await bootRootKeyService();
    await memory.rootKeyConfigStore.insert(RootKeyConfig.restore(retainedRow()));

    // Action
    const created = await service.createRotation({});

    // Assert
    expect(created.removesExpiringKey).toEqual({ label: "a".repeat(32), lastResolvedAt: null });
  });
});

describe("KmsRootKeyService.deleteStagedKey", () => {
  test("should discard the staged key when the label matches", async () => {
    // Setup
    const { service } = await bootRootKeyService();
    const { label } = await service.createRotation({});

    // Action
    await service.deleteStagedKey({ label });

    // Assert
    expect((await service.getRootKey()).staged).toBeNull();
  });

  test("should refuse another label and keep the staged key", async () => {
    // Setup
    const { service } = await bootRootKeyService();
    const { label } = await service.createRotation({});

    // Action
    const result = service.deleteStagedKey({ label: "b".repeat(32) });

    // Assert
    await expect(result).rejects.toThrow("Someone else staged a key after you loaded this page");
    expect((await service.getRootKey()).staged?.label).toBe(label);
  });

  test("should report a missing staged key as not found", async () => {
    // Setup
    const { service } = await bootRootKeyService();

    // Action
    const result = service.deleteStagedKey({ label: "a".repeat(32) });

    // Assert
    await expect(result).rejects.toBeInstanceOf(EntityNotFoundError);
    await expect(result).rejects.toThrow("There is no staged encryption key to discard.");
  });
});

describe("KmsRootKeyService.getRootKey and listRotations", () => {
  test("should report the active key, and the retained key as expiring", async () => {
    // Setup
    const { service, memory } = await bootRootKeyService();
    const supersededAt = new Date(Date.now() - DAY_MS);
    await memory.rootKeyConfigStore.insert(RootKeyConfig.restore(retainedRow({ supersededAt })));

    // Action
    const status = await service.getRootKey();

    // Assert
    expect(status.encryptionStrategy).toBe(RootKeyEncryptionStrategy.Software);
    expect(status.expiring).toEqual({
      label: "a".repeat(32),
      supersededAt,
      lastResolvedAt: null,
      expiresAt: new Date(supersededAt.getTime() + 30 * DAY_MS)
    });
  });

  test("should list the KEK history newest first with the total", async () => {
    // Setup
    const { service } = await bootRootKeyService();

    // Action
    const { rotations, totalCount } = await service.listRotations({ offset: 0, limit: 5 });

    // Assert
    expect(totalCount).toBe(1);
    expect(rotations).toHaveLength(1);
    expect(rotations[0]).toMatchObject({ supersededAt: null, retiredAt: null });
  });
});

describe("KmsRootKeyService.removeInactiveKeys", () => {
  test("should remove a retained key nothing has been seen using", async () => {
    // Setup
    const { service, isRetained } = await buildCleanup({ stored: retainedRow() });

    // Action
    await service.removeInactiveKeys();

    // Assert
    expect(await isRetained()).toBe(false);
  });

  // The boot stamp is written outside the root key lock, so an instance can stamp between the first read and the
  // locked delete. Deleting anyway would break that instance's next restart.
  test("should keep a retained key an instance reported using after the candidates were read", async () => {
    // Setup
    const { service, isRetained } = await buildCleanup({
      snapshot: retainedRow({ lastResolvedAt: null }),
      stored: retainedRow({ lastResolvedAt: new Date() })
    });

    // Action
    await service.removeInactiveKeys();

    // Assert
    expect(await isRetained()).toBe(true);
  });

  test("should remove a key whose last reported use is older than the retention window", async () => {
    // Setup
    const { service, isRetained } = await buildCleanup({
      stored: retainedRow({ lastResolvedAt: new Date(Date.now() - (RETENTION_DAYS + 1) * DAY_MS) })
    });

    // Action
    await service.removeInactiveKeys();

    // Assert
    expect(await isRetained()).toBe(false);
  });

  test("should keep a key that stopped being superseded between the first read and the lock", async () => {
    // Setup
    const { service, isRetained } = await buildCleanup({
      snapshot: retainedRow(),
      stored: retainedRow({ supersededAt: null })
    });

    // Action
    await service.removeInactiveKeys();

    // Assert
    expect(await isRetained()).toBe(true);
  });

  test("should keep a retained key still inside its retention window", async () => {
    // Setup
    const { service, isRetained } = await buildCleanup({
      stored: retainedRow({ supersededAt: new Date(Date.now() - DAY_MS) })
    });

    // Action
    await service.removeInactiveKeys();

    // Assert
    expect(await isRetained()).toBe(true);
  });

  test("should discard a staged key nobody deployed for a month, and keep a recent one", async () => {
    // Setup
    const { service, memory } = await bootRootKeyService();
    const old = new Date(Date.now() - 31 * DAY_MS);
    await memory.rootKeyConfigStore.insert(
      RootKeyConfig.restore({
        id: "22222222-2222-2222-2222-222222222222",
        encryptedRootKey: Buffer.alloc(32, 2),
        encryptionStrategy: "SOFTWARE",
        kekLabel: "c".repeat(32),
        createdAt: old,
        updatedAt: old
      })
    );

    // Action
    await service.removeInactiveKeys();

    // Assert
    expect((await service.getRootKey()).staged).toBeNull();
  });

  test("should mark the KEK history entry of a removed key as retired", async () => {
    // Setup
    const { service, memory } = await bootRootKeyService();
    const label = "a".repeat(32);
    await memory.kekHistoryStore.insert(KekHistoryEntry.create({ kekLabel: label, activatedAt: new Date() }));
    await memory.rootKeyConfigStore.insert(
      RootKeyConfig.restore(retainedRow({ supersededAt: new Date(Date.now() - 31 * DAY_MS) }))
    );

    // Action
    await service.removeInactiveKeys();

    // Assert
    expect(await memory.kekHistoryStore.findActiveByLabel(label)).toBeNull();
  });
});

describe("KmsRootKeyService.deleteExpiringKey", () => {
  // force overrides the straggler check only. Left overridable, an admin acting on a stale view would destroy a
  // key a second admin rotated in after that view was read, which is not recoverable.
  test("should refuse a label that is not the key currently retained, even with force", async () => {
    // Setup
    const { service, isRetained } = await buildCleanup({ stored: retainedRow({ lastResolvedAt: new Date() }) });

    // Action
    const result = service.deleteExpiringKey({ label: "b".repeat(32), force: true });

    // Assert
    await expect(result).rejects.toThrow("Another rotation has taken effect");
    expect(await isRetained()).toBe(true);
  });

  test("should refuse an unlabelled key rather than remove one nothing can name", async () => {
    // Setup
    const { service, isRetained } = await buildCleanup({ stored: retainedRow({ kekLabel: null }) });

    // Action
    const result = service.deleteExpiringKey({ label: "a".repeat(32) });

    // Assert
    await expect(result).rejects.toThrow(/Restart the instance/);
    expect(await isRetained()).toBe(true);
  });

  test("should ask for force while an instance recently started on the key", async () => {
    // Setup
    const row = retainedRow({ lastResolvedAt: new Date() });
    const { service, isRetained } = await buildCleanup({ stored: row });

    // Action
    const result = service.deleteExpiringKey({ label: row.kekLabel as string });

    // Assert
    await expect(result).rejects.toThrow(/force=true/);
    expect(await isRetained()).toBe(true);
  });

  test("should remove the key with force despite an instance recently starting on it", async () => {
    // Setup
    const row = retainedRow({ lastResolvedAt: new Date() });
    const { service, isRetained } = await buildCleanup({ stored: row });

    // Action
    await service.deleteExpiringKey({ label: row.kekLabel as string, force: true });

    // Assert
    expect(await isRetained()).toBe(false);
  });

  test("should report a missing previous key as not found", async () => {
    // Setup
    const { service } = await bootRootKeyService();

    // Action
    const result = service.deleteExpiringKey({ label: "a".repeat(32) });

    // Assert
    await expect(result).rejects.toBeInstanceOf(EntityNotFoundError);
    await expect(result).rejects.toThrow("There is no previous encryption key to remove.");
  });
});
