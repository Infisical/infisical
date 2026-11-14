import { randomUUID } from "node:crypto";

import { TOrganizationKeyStore } from "../services/dependencies";

export type TOrganizationKeyStoreHarness = {
  store: TOrganizationKeyStore;
  // An organization whose key columns are empty.
  newOrg: () => Promise<string>;
  // A KMS key the org columns may point at (a foreign key on Postgres).
  newKmsKeyId: (orgId: string) => Promise<string>;
};

export const describeOrganizationKeyStoreContract = (
  name: string,
  setup: () => Promise<TOrganizationKeyStoreHarness>
) => {
  describe(`${name} organization key store contract`, () => {
    test("should return null for an organization that does not exist", async () => {
      const { store } = await setup();

      expect(await store.find(randomUUID())).toBeNull();
    });

    test("should return an organization with no keys yet", async () => {
      const { store, newOrg } = await setup();
      const orgId = await newOrg();

      const key = await store.find(orgId);

      expect(key?.toJSON()).toEqual({ orgId, kmsKeyId: null, encryptedDataKey: null });
    });

    test("should claim the KMS key and then the data key", async () => {
      const { store, newOrg, newKmsKeyId } = await setup();
      const orgId = await newOrg();
      const kmsKeyId = await newKmsKeyId(orgId);
      const key = (await store.find(orgId))!;
      key.assignKmsKey(kmsKeyId);

      const claimedKey = await store.claimKmsKey(key);
      const reloaded = (await store.find(orgId))!;
      reloaded.assignDataKey(Buffer.from("data-key"));
      const claimedDataKey = await store.claimDataKey(reloaded);

      expect(claimedKey).toBe(true);
      expect(claimedDataKey).toBe(true);
      expect((await store.find(orgId))?.toJSON()).toEqual({
        orgId,
        kmsKeyId,
        encryptedDataKey: Buffer.from("data-key")
      });
    });

    test("should refuse to claim a KMS key and a data key that are already set", async () => {
      const { store, newOrg, newKmsKeyId } = await setup();
      const orgId = await newOrg();
      const winnerKmsKeyId = await newKmsKeyId(orgId);
      const loserKmsKeyId = await newKmsKeyId(orgId);
      const winner = (await store.find(orgId))!;
      const loser = (await store.find(orgId))!;
      winner.assignKmsKey(winnerKmsKeyId);
      loser.assignKmsKey(loserKmsKeyId);
      await store.claimKmsKey(winner);
      winner.assignDataKey(Buffer.from("winner"));
      loser.assignDataKey(Buffer.from("loser"));
      await store.claimDataKey(winner);

      const claimedKey = await store.claimKmsKey(loser);
      const claimedDataKey = await store.claimDataKey(loser);

      expect(claimedKey).toBe(false);
      expect(claimedDataKey).toBe(false);
      expect((await store.find(orgId))?.toJSON()).toEqual({
        orgId,
        kmsKeyId: winnerKmsKeyId,
        encryptedDataKey: Buffer.from("winner")
      });
    });

    test("should report whether an organization uses a KMS key", async () => {
      const { store, newOrg, newKmsKeyId } = await setup();
      const orgId = await newOrg();
      const used = await newKmsKeyId(orgId);
      const unused = await newKmsKeyId(orgId);
      const key = (await store.find(orgId))!;
      key.assignKmsKey(used);
      await store.claimKmsKey(key);

      expect(await store.referencesKey(used)).toBe(true);
      expect(await store.referencesKey(unused)).toBe(false);
    });
  });
};
