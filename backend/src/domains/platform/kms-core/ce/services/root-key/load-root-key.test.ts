import { RuleViolationError } from "@app/domains/lib/errors";
import { getLegacyDecryptionCandidates, resetLegacyKeyMaterial } from "@app/lib/crypto/legacy-key";

import { RootKey } from "../../models/root-key";
import { KMS_ROOT_CONFIG_UUID, RootKeyConfig, RootKeyEncryptionStrategy } from "../../models/root-key-config";
import { InMemoryKmsCoreStores } from "../../testing/in-memory-kms-core-stores";
import { fakeHsm, ROOT_KEY_TEST_ENCRYPTION_KEY, rootKeyTestEnv } from "../../testing/root-key-fixture";
import { loadRootKey, TLoadRootKeyDeps } from "./load-root-key";
import { KmsRootKeyService } from "./service";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

const OTHER_KEY = "9f2c1e7a4b6d83051c2e4f6a8b0d1e3f";
const now = () => new Date();

const depsFor = (memory: InMemoryKmsCoreStores, overrides: Partial<TLoadRootKeyDeps> = {}): TLoadRootKeyDeps => ({
  transactionRunner: memory.transactionRunner,
  stores: memory.stores,
  env: rootKeyTestEnv(),
  isFipsEnabled: () => false,
  rootKeyWrapper: undefined,
  ...overrides
});

const serviceFor = (memory: InMemoryKmsCoreStores, rootKey: RootKey, env = rootKeyTestEnv()) =>
  new KmsRootKeyService(memory.transactionRunner, rootKey, env, () => false, undefined);

describe("loadRootKey", () => {
  afterEach(() => {
    resetLegacyKeyMaterial();
  });

  test("should bootstrap one software root config on an empty instance", async () => {
    // Setup
    const memory = new InMemoryKmsCoreStores();

    // Action
    await loadRootKey(depsFor(memory));

    // Assert
    const rows = await memory.stores.rootKeyConfigStore.findAll();
    expect(rows.map((row) => row.id)).toEqual([KMS_ROOT_CONFIG_UUID]);
    expect(rows[0].strategy).toBe(RootKeyEncryptionStrategy.Software);
    expect(rows[0].activatedAt).toBeTruthy();
  });

  test("should bootstrap without rotation state when skipRotationState is set", async () => {
    // Setup
    const memory = new InMemoryKmsCoreStores();

    // Action
    await loadRootKey(depsFor(memory, { skipRotationState: true }));

    // Assert
    const [row] = await memory.stores.rootKeyConfigStore.findAll();
    expect(row.activatedAt).toBeNull();
    expect(await memory.stores.kekHistoryStore.count()).toBe(0);
    expect(await memory.stores.legacyEncryptionKeyStore.find()).toBeNull();
  });

  test("should refuse to boot when the software strategy has no encryption key, and write nothing", async () => {
    // Setup
    const memory = new InMemoryKmsCoreStores();

    // Action
    const result = loadRootKey(depsFor(memory, { env: rootKeyTestEnv({ ENCRYPTION_KEY: undefined }) }));

    // Assert
    await expect(result).rejects.toThrow("Please set the ENCRYPTION_KEY environment variable");
    expect(await memory.stores.rootKeyConfigStore.findAll()).toEqual([]);
  });

  test("should refuse an encryption key that is not a base64 256-bit key in FIPS mode", async () => {
    // Setup
    const memory = new InMemoryKmsCoreStores();

    // Action
    const result = loadRootKey(
      depsFor(memory, {
        env: rootKeyTestEnv({ ENCRYPTION_KEY: undefined, ROOT_ENCRYPTION_KEY: "not-base64!" }),
        isFipsEnabled: () => true
      })
    );

    // Assert
    await expect(result).rejects.toBeInstanceOf(RuleViolationError);
    await expect(result).rejects.toThrow("is not a base64 encoded 256-bit key");
  });

  test("should refuse to boot on an HSM root config when the instance is not entitled to HSM", async () => {
    // Setup
    const memory = new InMemoryKmsCoreStores();
    const hsm = fakeHsm({ entitled: false });
    const encryptedRootKey = await hsm.wrap(Buffer.alloc(32, 1));
    await memory.stores.rootKeyConfigStore.insert(
      RootKeyConfig.restore({
        id: KMS_ROOT_CONFIG_UUID,
        encryptedRootKey,
        encryptionStrategy: RootKeyEncryptionStrategy.HSM,
        createdAt: now(),
        updatedAt: now()
      })
    );

    // Action
    const result = loadRootKey(depsFor(memory, { rootKeyWrapper: hsm }));

    // Assert
    await expect(result).rejects.toThrow("Your license does not include HSM integration");
  });

  test("should give a readable error on an HSM root config without the enterprise edition", async () => {
    // Setup
    const memory = new InMemoryKmsCoreStores();
    await memory.stores.rootKeyConfigStore.insert(
      RootKeyConfig.restore({
        id: KMS_ROOT_CONFIG_UUID,
        encryptedRootKey: Buffer.alloc(48),
        encryptionStrategy: RootKeyEncryptionStrategy.HSM,
        createdAt: now(),
        updatedAt: now()
      })
    );

    // Action
    const result = loadRootKey(depsFor(memory));

    // Assert
    await expect(result).rejects.toThrow("requires the Infisical enterprise edition");
  });

  test("should bootstrap an HSM-wrapped root key when an HSM is configured", async () => {
    // Setup
    const memory = new InMemoryKmsCoreStores();
    const hsm = fakeHsm({ entitled: true });

    // Action
    const rootKey = await loadRootKey(
      depsFor(memory, { rootKeyWrapper: hsm, env: rootKeyTestEnv({ ENCRYPTION_KEY: undefined }) })
    );

    // Assert
    const [row] = await memory.stores.rootKeyConfigStore.findAll();
    expect(row.strategy).toBe(RootKeyEncryptionStrategy.HSM);
    expect(rootKey.equals(RootKey.fromBytes(Buffer.alloc(32, 7)))).toBe(true);
  });

  test("should resolve the same root key on restart", async () => {
    // Setup
    const memory = new InMemoryKmsCoreStores();
    const first = await loadRootKey(depsFor(memory));

    // Action
    const second = await loadRootKey(depsFor(memory));

    // Assert
    expect(second.equals(first)).toBe(true);
  });

  test("should name the labels it knows when the configured key does not open the stored root key", async () => {
    // Setup
    const memory = new InMemoryKmsCoreStores();
    await loadRootKey(depsFor(memory));

    // Action
    const result = loadRootKey(depsFor(memory, { env: rootKeyTestEnv({ ENCRYPTION_KEY: OTHER_KEY }) }));

    // Assert
    await expect(result).rejects.toThrow("does not decrypt this database's root key");
    await expect(result).rejects.toThrow("This database was last written with encryption key label(s)");
  });

  test("should promote a staged rotation when a pod boots with the new key", async () => {
    // Setup
    const memory = new InMemoryKmsCoreStores();
    const rootKey = await loadRootKey(depsFor(memory));
    const { key, label } = await serviceFor(memory, rootKey).createRotation({});

    // Action
    const rotated = await loadRootKey(depsFor(memory, { env: rootKeyTestEnv({ ENCRYPTION_KEY: key }) }));

    // Assert
    const rows = await memory.stores.rootKeyConfigStore.findAll();
    const active = rows.find((row) => row.isActive);
    const retained = rows.filter((row) => row.isRetained);
    expect(rotated.equals(rootKey)).toBe(true);
    expect(rows).toHaveLength(2);
    expect(active?.kekLabel).toBe(label);
    expect(retained).toHaveLength(1);
    expect((await memory.stores.kekHistoryStore.findCurrent())?.kekLabel).toBe(label);
  });

  test("should keep only the newest retained key after a second promotion", async () => {
    // Setup
    const memory = new InMemoryKmsCoreStores();
    const rootKey = await loadRootKey(depsFor(memory));
    const first = await serviceFor(memory, rootKey).createRotation({});
    await loadRootKey(depsFor(memory, { env: rootKeyTestEnv({ ENCRYPTION_KEY: first.key }) }));
    const second = await serviceFor(memory, rootKey, rootKeyTestEnv({ ENCRYPTION_KEY: first.key })).createRotation({});

    // Action
    await loadRootKey(depsFor(memory, { env: rootKeyTestEnv({ ENCRYPTION_KEY: second.key }) }));

    // Assert
    const rows = await memory.stores.rootKeyConfigStore.findAll();
    expect(rows.filter((row) => row.isRetained).map((row) => row.kekLabel)).toEqual([first.label]);
  });

  test("should still boot a straggler on the retained key and stamp that it did", async () => {
    // Setup
    const memory = new InMemoryKmsCoreStores();
    const rootKey = await loadRootKey(depsFor(memory));
    const { key } = await serviceFor(memory, rootKey).createRotation({});
    await loadRootKey(depsFor(memory, { env: rootKeyTestEnv({ ENCRYPTION_KEY: key }) }));

    // Action
    const straggler = await loadRootKey(depsFor(memory));

    // Assert
    const retained = (await memory.stores.rootKeyConfigStore.findAll()).find((row) => row.isRetained);
    expect(straggler.equals(rootKey)).toBe(true);
    expect(retained?.lastResolvedAt).toBeTruthy();
  });

  test("should label an active row written before labels existed", async () => {
    // Setup
    const memory = new InMemoryKmsCoreStores();
    await loadRootKey(depsFor(memory, { skipRotationState: true }));

    // Action
    await loadRootKey(depsFor(memory));

    // Assert
    const active = await memory.stores.rootKeyConfigStore.findById(KMS_ROOT_CONFIG_UUID);
    expect(active?.kekLabel).toMatch(/^[0-9a-f]{32}$/);
  });

  test("should backfill one KEK history entry and not another on restart", async () => {
    // Setup
    const memory = new InMemoryKmsCoreStores();
    await loadRootKey(depsFor(memory));

    // Action
    await loadRootKey(depsFor(memory));

    // Assert
    expect(await memory.stores.kekHistoryStore.count()).toBe(1);
  });

  test("should snapshot the legacy env keys under the root key and expose them", async () => {
    // Setup
    const memory = new InMemoryKmsCoreStores();

    // Action
    const rootKey = await loadRootKey(depsFor(memory));

    // Assert
    const stored = await memory.stores.legacyEncryptionKeyStore.find();
    expect(stored?.open(rootKey).current.ENCRYPTION_KEY).toBe(ROOT_KEY_TEST_ENCRYPTION_KEY);
    expect(getLegacyDecryptionCandidates().length).toBeGreaterThan(0);
  });

  test("should keep using the stored legacy snapshot after the env key changes", async () => {
    // Setup
    const memory = new InMemoryKmsCoreStores();
    const rootKey = await loadRootKey(depsFor(memory));
    const { key } = await serviceFor(memory, rootKey).createRotation({});

    // Action
    await loadRootKey(depsFor(memory, { env: rootKeyTestEnv({ ENCRYPTION_KEY: key }) }));

    // Assert
    expect(getLegacyDecryptionCandidates()[0].ENCRYPTION_KEY).toBe(ROOT_KEY_TEST_ENCRYPTION_KEY);
  });
});
