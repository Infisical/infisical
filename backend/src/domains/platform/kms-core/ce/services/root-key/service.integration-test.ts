import { TableName } from "@app/db/schemas";
import { setupIntegration } from "@app/domains/lib/testing/integration";
import { resetLegacyKeyMaterial } from "@app/lib/crypto/legacy-key";

import { buildKmsCoreStoreAccess } from "../../data-access/kms-core-stores";
import { KMS_ROOT_CONFIG_UUID } from "../../models/root-key-config";
import { rootKeyTestEnv } from "../../testing/root-key-fixture";
import { loadRootKey } from "./load-root-key";
import { RootKeyService, TKmsCoreEnv } from "./service";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

// Root key state is instance-wide, so each test gets a private database.
describe("RootKeyService on Postgres", () => {
  const h = setupIntegration({ freshDatabase: true });

  afterEach(() => {
    resetLegacyKeyMaterial();
  });

  const emptyRootKeyTables = async () => {
    await h.db(TableName.KmsServerRootConfig).delete();
    await h.db(TableName.KmsKekHistory).delete();
    await h.db(TableName.KmsLegacyEncryptionKey).delete();
  };

  const boot = async (overrides: Partial<TKmsCoreEnv> = {}) => {
    const access = buildKmsCoreStoreAccess(h.db, () => h.db);
    const env = rootKeyTestEnv(overrides);
    const deps = { ...access, env, isFipsEnabled: () => false, rootKeyWrapper: undefined };
    const rootKey = await loadRootKey(deps);
    const service = new RootKeyService(access.transactionRunner, rootKey, env, () => false, undefined);
    return { service, rootKey };
  };

  test("should bootstrap exactly one root config when two instances load at once", async () => {
    // Setup
    await emptyRootKeyTables();

    // Action
    const [first, second] = await Promise.all([boot(), boot()]);

    // Assert
    expect(await h.db(TableName.KmsServerRootConfig).select("id")).toEqual([{ id: KMS_ROOT_CONFIG_UUID }]);
    expect(first.service.getCookieSigningKey()).toBe(second.service.getCookieSigningKey());
  });

  test("should resolve the same root key on restart", async () => {
    // Setup
    await emptyRootKeyTables();
    const first = await boot();
    const blob = first.service.encryptWithRootKey()(Buffer.from("restart"));

    // Action
    const restarted = await boot();

    // Assert
    expect(restarted.service.decryptWithRootKey()(blob).toString()).toBe("restart");
  });

  test("should promote a staged rotation on boot with the new key and record it in the KEK history", async () => {
    // Setup
    await emptyRootKeyTables();
    const current = await boot();
    const blob = current.service.encryptWithRootKey()(Buffer.from("survives rotation"));
    const { key, label } = await current.service.createRotation({});

    // Action
    const rotated = await boot({ ENCRYPTION_KEY: key });

    // Assert
    expect(rotated.service.decryptWithRootKey()(blob).toString()).toBe("survives rotation");
    expect((await rotated.service.getRootKey()).active.label).toBe(label);
    expect((await rotated.service.listRotations({ offset: 0, limit: 5 })).rotations[0].label).toBe(label);
  });

  test("should still boot a straggler on the retained key after a promotion", async () => {
    // Setup
    await emptyRootKeyTables();
    const current = await boot();
    const { key } = await current.service.createRotation({});
    await boot({ ENCRYPTION_KEY: key });

    // Action
    await boot();

    // Assert
    const retained = await h.db(TableName.KmsServerRootConfig).whereNotNull("supersededAt").first();
    expect(retained?.lastResolvedAt).toBeTruthy();
  });

  test("should leave the active key and the staged key unchanged when a stale discard names another label", async () => {
    // Setup
    await emptyRootKeyTables();
    const { service } = await boot();
    const { label } = await service.createRotation({});

    // Action
    const result = service.deleteStagedKey({ label: "b".repeat(32) });

    // Assert
    await expect(result).rejects.toThrow("Someone else staged a key after you loaded this page");
    expect((await service.getRootKey()).staged?.label).toBe(label);
  });

  test("should stage exactly one key when two rotations are requested at once", async () => {
    // Setup
    await emptyRootKeyTables();
    const { service } = await boot();

    // Action
    const results = await Promise.allSettled([service.createRotation({}), service.createRotation({})]);

    // Assert
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(
      await h.db(TableName.KmsServerRootConfig).whereNull("activatedAt").whereNot("id", KMS_ROOT_CONFIG_UUID)
    ).toHaveLength(1);
  });
});
