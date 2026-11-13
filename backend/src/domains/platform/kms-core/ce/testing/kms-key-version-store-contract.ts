import { randomUUID } from "node:crypto";

import { KmsKey } from "../models/kms-key";
import { KmsKeyVersion } from "../models/kms-key-version";
import { newInternalKey, rootKeyForTests, TKmsKeyStoreFixture } from "./kms-key-store-contract";

// Versions hang off a key's internal material, so the fixture is the key store's.
export const describeKmsKeyVersionStoreContract = (name: string, setup: () => Promise<TKmsKeyStoreFixture>) => {
  const rotatedKey = async (rotations: number) => {
    const fixture = await setup();
    const key = newInternalKey(await fixture.newOrg());
    await fixture.keyStore.insert(key);
    const archived: KmsKeyVersion[] = [];
    for (let rotation = 0; rotation < rotations; rotation += 1) {
      // eslint-disable-next-line no-await-in-loop -- each rotation builds on the one before
      const loaded = (await fixture.keyStore.findForRotation(key.id)) as KmsKey;
      const version = loaded.rotate(rootKeyForTests);
      archived.push(version);
      // eslint-disable-next-line no-await-in-loop
      await fixture.versionStore.insert(version);
      // eslint-disable-next-line no-await-in-loop
      await fixture.keyStore.save(loaded);
    }
    return { ...fixture, key, archived, internalKmsId: key.toJSON().internal?.id as string };
  };

  describe(`KmsKeyVersionStore contract (${name})`, () => {
    test("should list every archived version of a key with its wrapped material", async () => {
      // Setup
      const { versionStore, archived, internalKmsId } = await rotatedKey(2);

      // Action
      const listed = await versionStore.listByInternalKmsId(internalKmsId);

      // Assert
      expect(listed.map((version) => version.toJSON()).sort((a, b) => a.version - b.version)).toEqual(
        archived.map((version) => version.toJSON())
      );
    });

    test("should list only the versions of the key asked for", async () => {
      // Setup
      const { versionStore, newOrg, keyStore, internalKmsId } = await rotatedKey(1);
      const other = newInternalKey(await newOrg(), { name: "other" });
      await keyStore.insert(other);

      // Action
      const [ofOther, ofRotated] = await Promise.all([
        versionStore.listByInternalKmsId(other.toJSON().internal?.id as string),
        versionStore.listByInternalKmsId(internalKmsId)
      ]);

      // Assert
      expect(ofOther).toEqual([]);
      expect(ofRotated).toHaveLength(1);
    });

    test("should list nothing for an internal key that does not exist", async () => {
      // Setup
      const { versionStore } = await setup();

      // Action
      const listed = await versionStore.listByInternalKmsId(randomUUID());

      // Assert
      expect(listed).toEqual([]);
    });

    test("should refuse a second archive of the same version", async () => {
      // Setup
      const { versionStore, archived, internalKmsId } = await rotatedKey(1);
      const duplicate = KmsKeyVersion.create({
        internalKmsId,
        encryptedKey: Buffer.from("again"),
        version: archived[0].version
      });

      // Action
      const result = versionStore.insert(duplicate);

      // Assert
      await expect(result).rejects.toThrow();
      expect(await versionStore.listByInternalKmsId(internalKmsId)).toHaveLength(1);
    });
  });
};
