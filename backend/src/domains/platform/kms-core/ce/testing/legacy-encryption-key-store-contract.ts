import { LegacyEncryptionKey } from "../models/legacy-encryption-key";
import { RootKey } from "../models/root-key";
import { TLegacyEncryptionKeyStore } from "../services/dependencies";

type TSetup = () => Promise<{ store: TLegacyEncryptionKeyStore }>;

const keyFor = (value: string) =>
  LegacyEncryptionKey.create({ current: { ENCRYPTION_KEY: value } }, RootKey.generate());

export const describeLegacyEncryptionKeyStoreContract = (name: string, setup: TSetup) => {
  describe(`${name} legacy encryption key contract`, () => {
    test("should return null before anything is inserted", async () => {
      // Setup
      const { store } = await setup();

      // Action
      const found = await store.find();

      // Assert
      expect(found).toBeNull();
    });

    test("should return what was inserted", async () => {
      // Setup
      const { store } = await setup();
      const key = keyFor("a");

      // Action
      await store.insert(key);
      const found = await store.find();

      // Assert
      expect(found?.id).toBe(key.id);
      expect(found?.encryptedKeySnapshot.equals(key.encryptedKeySnapshot)).toBe(true);
    });

    test("should ignore a second insert and keep the first", async () => {
      // Setup
      const { store } = await setup();
      const first = keyFor("first");
      await store.insert(first);

      // Action
      await store.insert(keyFor("second"));

      // Assert
      const found = await store.find();
      expect(found?.encryptedKeySnapshot.equals(first.encryptedKeySnapshot)).toBe(true);
    });
  });
};
