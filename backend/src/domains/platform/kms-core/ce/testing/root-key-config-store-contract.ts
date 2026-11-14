import { randomBytes } from "node:crypto";

import { DatabaseError } from "@app/lib/errors";

import { RootKeyConfig, RootKeyEncryptionStrategy } from "../models/root-key-config";
import { TRootKeyConfigStore } from "../services/dependencies";

type TSetup = () => Promise<{ store: TRootKeyConfigStore }>;

const activeConfig = () =>
  RootKeyConfig.bootstrap({
    encryptedRootKey: randomBytes(60),
    strategy: RootKeyEncryptionStrategy.Software,
    withRotationState: true
  });

const stagedConfig = () => RootKeyConfig.stage({ encryptedRootKey: randomBytes(60), kekLabel: "staged-label" });

export const describeRootKeyConfigStoreContract = (name: string, setup: TSetup) => {
  describe(`${name} root key config contract`, () => {
    test("should return what was inserted", async () => {
      // Setup
      const { store } = await setup();
      const staged = stagedConfig();

      // Action
      await store.insert(staged);
      const found = await store.findById(staged.id);

      // Assert
      expect(found?.id).toBe(staged.id);
      expect(found?.encryptedRootKey.equals(staged.encryptedRootKey)).toBe(true);
      expect(found?.isStaged).toBe(true);
      expect(found?.strategy).toBe(RootKeyEncryptionStrategy.Software);
      expect(found?.kekLabel).toBe("staged-label");
    });

    test("should return null for a row that does not exist", async () => {
      // Setup
      const { store } = await setup();

      // Action
      const found = await store.findById("11111111-1111-4111-8111-111111111111");

      // Assert
      expect(found).toBeNull();
    });

    test("should list every row", async () => {
      // Setup
      const { store } = await setup();
      const active = activeConfig();
      const staged = stagedConfig();
      await store.insert(active);
      await store.insert(staged);

      // Action
      const all = await store.findAll();

      // Assert
      expect(all.map((config) => config.id).sort()).toEqual([active.id, staged.id].sort());
    });

    test("should persist a promotion: the active row takes the staged key and a retained copy is kept", async () => {
      // Setup
      const { store } = await setup();
      const active = activeConfig();
      const staged = stagedConfig();
      await store.insert(active);
      await store.insert(staged);
      const previousKey = active.encryptedRootKey;

      // Action
      const retained = active.promote(staged, null, new Date());
      await store.insert(retained);
      await store.save(active);
      await store.deleteAllStaged();

      // Assert
      const reloadedActive = await store.findById(active.id);
      const reloadedRetained = await store.findById(retained.id);
      expect(reloadedActive?.encryptedRootKey.equals(staged.encryptedRootKey)).toBe(true);
      expect(reloadedActive?.kekLabel).toBe("staged-label");
      expect(reloadedActive?.supersededAt).toBeNull();
      expect(reloadedRetained?.isRetained).toBe(true);
      expect(reloadedRetained?.encryptedRootKey.equals(previousKey)).toBe(true);
      expect(await store.findById(staged.id)).toBeNull();
    });

    test("should persist a label and a resolution stamp", async () => {
      // Setup
      const { store } = await setup();
      const active = activeConfig();
      const retained = active.retainedCopy(new Date());
      await store.insert(active);
      await store.insert(retained);
      const resolvedAt = new Date("2030-01-02T03:04:05.000Z");

      // Action
      active.labelWith("from-env");
      retained.recordResolution(resolvedAt);
      await store.save(active);
      await store.save(retained);

      // Assert
      expect((await store.findById(active.id))?.kekLabel).toBe("from-env");
      expect((await store.findById(retained.id))?.lastResolvedAt).toEqual(resolvedAt);
    });

    test("should persist a strategy change", async () => {
      // Setup
      const { store } = await setup();
      const active = activeConfig();
      await store.insert(active);
      const hsmBlob = randomBytes(80);

      // Action
      active.rewrap(hsmBlob, RootKeyEncryptionStrategy.HSM, "ignored");
      await store.save(active);

      // Assert
      const reloaded = await store.findById(active.id);
      expect(reloaded?.strategy).toBe(RootKeyEncryptionStrategy.HSM);
      expect(reloaded?.kekLabel).toBeNull();
      expect(reloaded?.encryptedRootKey.equals(hsmBlob)).toBe(true);
    });

    test("should refuse to insert a second row with the same id and keep the first", async () => {
      // Setup
      const { store } = await setup();
      const active = activeConfig();
      await store.insert(active);

      // Action
      const result = store.insert(activeConfig());

      // Assert
      await expect(result).rejects.toBeInstanceOf(DatabaseError);
      expect((await store.findById(active.id))?.encryptedRootKey.equals(active.encryptedRootKey)).toBe(true);
    });

    test("should report whether a delete removed a row", async () => {
      // Setup
      const { store } = await setup();
      const staged = stagedConfig();
      await store.insert(staged);

      // Action
      const first = await store.delete(staged.id);
      const second = await store.delete(staged.id);

      // Assert
      expect([first, second]).toEqual([true, false]);
    });

    test("should delete every staged row and nothing else", async () => {
      // Setup
      const { store } = await setup();
      const active = activeConfig();
      const retained = active.retainedCopy(new Date());
      const staged = stagedConfig();
      await store.insert(active);
      await store.insert(retained);
      await store.insert(staged);

      // Action
      await store.deleteAllStaged();

      // Assert
      const remaining = await store.findAll();
      expect(remaining.map((config) => config.id).sort()).toEqual([active.id, retained.id].sort());
    });
  });
};
