import { randomUUID } from "node:crypto";

import { TProjectKeyStore } from "../services/dependencies";

export type TProjectKeyStoreHarness = {
  store: TProjectKeyStore;
  // A project whose key columns are empty.
  newProject: () => Promise<{ projectId: string; orgId: string }>;
  // A KMS key the project columns may point at (a foreign key on Postgres).
  newKmsKeyId: (orgId: string) => Promise<string>;
  scheduleDeletion: (projectId: string) => Promise<void>;
};

export const describeProjectKeyStoreContract = (name: string, setup: () => Promise<TProjectKeyStoreHarness>) => {
  describe(`${name} project key store contract`, () => {
    const projectWithKey = async (harness: TProjectKeyStoreHarness) => {
      const { projectId, orgId } = await harness.newProject();
      const kmsKeyId = await harness.newKmsKeyId(orgId);
      const key = (await harness.store.find(projectId))!;
      key.assignKmsKey(kmsKeyId);
      key.assignDataKey(Buffer.from("data-key"));
      await harness.store.claimKmsKey(key);
      await harness.store.claimDataKey(key);
      return { projectId, orgId, kmsKeyId };
    };

    test("should return null for a project that does not exist", async () => {
      const { store } = await setup();

      expect(await store.find(randomUUID())).toBeNull();
    });

    test("should return a project with no keys yet", async () => {
      const { store, newProject } = await setup();
      const { projectId, orgId } = await newProject();

      const key = await store.find(projectId);

      expect(key?.toJSON()).toEqual({
        projectId,
        orgId,
        kmsKeyId: null,
        encryptedDataKey: null,
        certificateKmsKeyId: null
      });
    });

    test("should claim the KMS key, the data key and the certificate key", async () => {
      const harness = await setup();
      const { store, newProject, newKmsKeyId } = harness;
      const { projectId, orgId } = await newProject();
      const kmsKeyId = await newKmsKeyId(orgId);
      const certificateKmsKeyId = await newKmsKeyId(orgId);
      const key = (await store.find(projectId))!;
      key.assignKmsKey(kmsKeyId);
      key.assignDataKey(Buffer.from("data-key"));
      key.assignCertificateKey(certificateKmsKeyId);

      const results = [
        await store.claimKmsKey(key),
        await store.claimDataKey(key),
        await store.claimCertificateKey(key)
      ];

      expect(results).toEqual([true, true, true]);
      expect((await store.find(projectId))?.toJSON()).toEqual({
        projectId,
        orgId,
        kmsKeyId,
        encryptedDataKey: Buffer.from("data-key"),
        certificateKmsKeyId
      });
    });

    test("should refuse to claim a column that is already set", async () => {
      const { store, newProject, newKmsKeyId } = await setup();
      const { projectId, orgId } = await newProject();
      const winnerKmsKeyId = await newKmsKeyId(orgId);
      const loserKmsKeyId = await newKmsKeyId(orgId);
      const winnerCertificateKeyId = await newKmsKeyId(orgId);
      const loserCertificateKeyId = await newKmsKeyId(orgId);
      const winner = (await store.find(projectId))!;
      const loser = (await store.find(projectId))!;
      winner.assignKmsKey(winnerKmsKeyId);
      winner.assignDataKey(Buffer.from("winner"));
      winner.assignCertificateKey(winnerCertificateKeyId);
      loser.assignKmsKey(loserKmsKeyId);
      loser.assignDataKey(Buffer.from("loser"));
      loser.assignCertificateKey(loserCertificateKeyId);
      await store.claimKmsKey(winner);
      await store.claimDataKey(winner);
      await store.claimCertificateKey(winner);

      const results = [
        await store.claimKmsKey(loser),
        await store.claimDataKey(loser),
        await store.claimCertificateKey(loser)
      ];

      expect(results).toEqual([false, false, false]);
      expect((await store.find(projectId))?.toJSON()).toEqual({
        projectId,
        orgId,
        kmsKeyId: winnerKmsKeyId,
        encryptedDataKey: Buffer.from("winner"),
        certificateKmsKeyId: winnerCertificateKeyId
      });
    });

    test("should switch the key when the project still uses the expected one", async () => {
      const harness = await setup();
      const { projectId, orgId, kmsKeyId } = await projectWithKey(harness);
      const newKmsKeyId = await harness.newKmsKeyId(orgId);
      const key = (await harness.store.find(projectId))!;
      const previous = key.switchTo(newKmsKeyId, Buffer.from("rewrapped"));

      const switched = await harness.store.switchKey(key, previous);

      expect(previous).toBe(kmsKeyId);
      expect(switched).toBe(true);
      const stored = (await harness.store.find(projectId))?.toJSON();
      expect(stored?.kmsKeyId).toBe(newKmsKeyId);
      expect(stored?.encryptedDataKey).toEqual(Buffer.from("rewrapped"));
    });

    test("should fail the switch when the expected key differs and leave the row unchanged", async () => {
      const harness = await setup();
      const { projectId, orgId, kmsKeyId } = await projectWithKey(harness);
      const otherKmsKeyId = await harness.newKmsKeyId(orgId);
      const key = (await harness.store.find(projectId))!;
      key.switchTo(otherKmsKeyId, Buffer.from("rewrapped"));

      const switched = await harness.store.switchKey(key, randomUUID());

      expect(switched).toBe(false);
      const stored = (await harness.store.find(projectId))?.toJSON();
      expect(stored?.kmsKeyId).toBe(kmsKeyId);
      expect(stored?.encryptedDataKey).toEqual(Buffer.from("data-key"));
    });

    test("should save the key and data key unconditionally", async () => {
      const harness = await setup();
      const { projectId, orgId } = await projectWithKey(harness);
      const restoredKmsKeyId = await harness.newKmsKeyId(orgId);
      const key = (await harness.store.find(projectId))!;
      key.switchTo(restoredKmsKeyId, Buffer.from("restored"));

      await harness.store.save(key);

      const stored = (await harness.store.find(projectId))?.toJSON();
      expect(stored?.kmsKeyId).toBe(restoredKmsKeyId);
      expect(stored?.encryptedDataKey).toEqual(Buffer.from("restored"));
    });

    test("should not find a project scheduled for deletion", async () => {
      const harness = await setup();
      const { projectId } = await harness.newProject();
      await harness.scheduleDeletion(projectId);

      expect(await harness.store.find(projectId)).toBeNull();
    });

    test("should report a key used as a project key, certificate key or by a project pending deletion", async () => {
      const harness = await setup();
      const { store } = harness;
      const { projectId, orgId, kmsKeyId } = await projectWithKey(harness);
      const certificateKmsKeyId = await harness.newKmsKeyId(orgId);
      const certificateKey = (await store.find(projectId))!;
      certificateKey.assignCertificateKey(certificateKmsKeyId);
      await store.claimCertificateKey(certificateKey);
      const unused = await harness.newKmsKeyId(orgId);
      await harness.scheduleDeletion(projectId);

      expect(await store.referencesKey(kmsKeyId)).toBe(true);
      expect(await store.referencesKey(certificateKmsKeyId)).toBe(true);
      expect(await store.referencesKey(unused)).toBe(false);
    });
  });
};
