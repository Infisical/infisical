import { ProjectType, TableName } from "@app/db/schemas";
import { setupIntegration } from "@app/domains/lib/testing/integration";
import { sealKnexTransaction } from "@app/domains/lib/transactions";

import { buildKmsCoreStoreAccess } from "../../data-access/kms-core-stores";
import { RootKey } from "../../models/root-key";
import { KmsDataKeyService, KmsDataKey } from "./service";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

describe("KmsDataKeyService.within on Postgres", () => {
  const h = setupIntegration();

  const newService = (rootKey = RootKey.generate()) => {
    const { transactionRunner, stores } = buildKmsCoreStoreAccess(h.db, () => h.db);
    return new KmsDataKeyService(transactionRunner, stores, rootKey, undefined);
  };

  const kmsKeyCount = async (orgId: string) => {
    const [{ count }] = await h.db(TableName.KmsKey).where({ orgId }).count<{ count: string }[]>("* as count");
    return Number(count);
  };

  const waitForAnyAdvisoryLockWaiter = async () => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      // eslint-disable-next-line no-await-in-loop
      const { rows } = (await h.db.raw(
        "SELECT count(*)::int AS waiting FROM pg_locks WHERE locktype = 'advisory' AND NOT granted"
      )) as { rows: { waiting: number }[] };
      if (rows[0].waiting > 0) return;
    }
    throw new Error("No connection waited on an advisory lock");
  };

  test("should delete a project's keys in the transaction that deletes the project, and keep them on rollback", async () => {
    // Setup
    const tn = await h.newTenant();
    const service = newService();
    const kmsKeyId = await service.getProjectSecretManagerKmsKeyId(tn.project.id);
    const deleteProjectAndKeys = (trx: Parameters<Parameters<typeof h.db.transaction>[0]>[0]) =>
      h
        .db(TableName.Project)
        .transacting(trx)
        .where({ id: tn.project.id })
        .delete()
        .then(() =>
          service.within(sealKnexTransaction(trx)).deleteProjectKeys({ orgId: tn.org.id, kmsKeyIds: [kmsKeyId] })
        );

    // Action
    const rolledBack = h.db.transaction(async (trx) => {
      await deleteProjectAndKeys(trx);
      throw new Error("rollback");
    });
    await expect(rolledBack).rejects.toThrow("rollback");
    const afterRollback = await h.db(TableName.KmsKey).where({ id: kmsKeyId }).first();
    await h.db.transaction(async (trx) => {
      await deleteProjectAndKeys(trx);
    });

    // Assert
    expect(afterRollback?.id).toBe(kmsKeyId);
    expect(await h.db(TableName.KmsKey).where({ id: kmsKeyId }).first()).toBeUndefined();
  });

  test("should leave no key behind when the caller's transaction rolls back", async () => {
    // Setup
    const tn = await h.newTenant();
    const service = newService();
    const keysBefore = await kmsKeyCount(tn.org.id);

    // Action
    const result = h.db.transaction(async (trx) => {
      await service
        .within(sealKnexTransaction(trx))
        .createCipherPairWithDataKey({ type: KmsDataKey.SecretManager, projectId: tn.project.id });
      throw new Error("rollback");
    });

    // Assert
    await expect(result).rejects.toThrow("rollback");
    expect(await kmsKeyCount(tn.org.id)).toBe(keysBefore);
    const project = await h.db(TableName.Project).where({ id: tn.project.id }).first();
    expect(project?.kmsSecretManagerKeyId).toBeNull();
    expect(project?.kmsSecretManagerEncryptedDataKey).toBeNull();
    const org = await h.db(TableName.Organization).where({ id: tn.org.id }).first();
    expect(org?.kmsDefaultKeyId).toBeNull();
    expect(org?.kmsEncryptedDataKey).toBeNull();
  });

  test("should see a project the caller created in the same uncommitted transaction", async () => {
    // Setup
    const tn = await h.newTenant();
    const rootKey = RootKey.generate();
    const service = newService(rootKey);
    const suffix = crypto.randomUUID();

    // Action
    const { projectId, blob } = await h.db.transaction(async (trx) => {
      const [created] = await trx(TableName.Project)
        .insert({
          name: `project-${suffix}`,
          slug: `project-${suffix}`,
          type: ProjectType.SecretManager,
          orgId: tn.org.id
        })
        .returning("id");
      const createdId = created.id;
      const cipher = await service
        .within(sealKnexTransaction(trx))
        .createCipherPairWithDataKey({ type: KmsDataKey.SecretManager, projectId: createdId });
      return {
        projectId: createdId,
        blob: cipher.encryptor({ plainText: Buffer.from("created with the project") }).cipherTextBlob
      };
    });

    // Assert
    const stored = await h.db(TableName.Project).where({ id: projectId }).first();
    expect(stored?.kmsSecretManagerKeyId && stored.kmsSecretManagerEncryptedDataKey).toBeTruthy();
    const outside = await newService(rootKey).createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId
    });
    expect(outside.decryptor({ cipherTextBlob: blob }).toString()).toBe("created with the project");
  });

  test("should give two caller transactions racing first use one project key and one data key", async () => {
    // Setup
    const tn = await h.newTenant();
    const service = newService();
    const context = { type: KmsDataKey.SecretManager, projectId: tn.project.id } as const;
    let firstHasKeys!: () => void;
    const firstDone = new Promise<void>((resolve) => {
      firstHasKeys = resolve;
    });
    let releaseFirst!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    // Action
    const first = h.db.transaction(async (trx) => {
      const cipher = await service.within(sealKnexTransaction(trx)).createCipherPairWithDataKey(context);
      firstHasKeys();
      await gate;
      return cipher;
    });
    await firstDone;
    const second = h.db.transaction((trx) =>
      service.within(sealKnexTransaction(trx)).createCipherPairWithDataKey(context)
    );
    await waitForAnyAdvisoryLockWaiter();
    releaseFirst();
    const [firstPair, secondPair] = await Promise.all([first, second]);

    // Assert
    expect(await kmsKeyCount(tn.org.id)).toBe(1);
    const project = await h.db(TableName.Project).where({ id: tn.project.id }).first();
    expect(project?.kmsSecretManagerKeyId && project.kmsSecretManagerEncryptedDataKey).toBeTruthy();
    const fromFirst = firstPair.encryptor({ plainText: Buffer.from("one") }).cipherTextBlob;
    const fromSecond = secondPair.encryptor({ plainText: Buffer.from("two") }).cipherTextBlob;
    expect(secondPair.decryptor({ cipherTextBlob: fromFirst }).toString()).toBe("one");
    expect(firstPair.decryptor({ cipherTextBlob: fromSecond }).toString()).toBe("two");
  });
});
