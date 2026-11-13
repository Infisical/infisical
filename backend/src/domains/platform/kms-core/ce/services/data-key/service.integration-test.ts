import { TableName } from "@app/db/schemas";
import { setupIntegration } from "@app/domains/lib/testing/integration";
import { pgAdvisoryLockHashText } from "@app/lib/crypto/hashtext";

import { buildKmsCoreStoreAccess } from "../../data-access/kms-core-stores";
import { RootKey } from "../../models/root-key";
import { ReadFrom } from "../helpers/read-options";
import { DataKeyService, KmsDataKey, KmsType } from "./service";

describe("DataKeyService on Postgres", () => {
  const h = setupIntegration();

  const newService = () => {
    const { transactionRunner, stores } = buildKmsCoreStoreAccess(h.db, () => h.db);
    return new DataKeyService(transactionRunner, stores, RootKey.generate(), undefined);
  };

  // Polls until another connection is queued on the advisory lock, which proves it asked for the same id.
  const waitForAdvisoryLockWaiter = async (lockId: number) => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      // eslint-disable-next-line no-await-in-loop
      const { rows } = (await h.db.raw(
        "SELECT count(*)::int AS waiting FROM pg_locks WHERE locktype = 'advisory' AND NOT granted AND objid = ?",
        [lockId]
      )) as { rows: { waiting: number }[] };
      if (rows[0].waiting > 0) return;
    }
    throw new Error(`No connection waited on advisory lock ${lockId}`);
  };

  const reservedKeyCount = async (orgId: string) => {
    const [{ count }] = await h
      .db(TableName.KmsKey)
      .where({ orgId, isReserved: true })
      .count<{ count: string }[]>("* as count");
    return Number(count);
  };

  test("should create exactly one org key, org data key, project key and project data key under 10 concurrent callers", async () => {
    // Setup
    const tn = await h.newTenant();
    const service = newService();

    // Action
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        service.createCipherPairWithDataKey(
          i % 2
            ? { type: KmsDataKey.Organization, orgId: tn.org.id }
            : { type: KmsDataKey.SecretManager, projectId: tn.project.id }
        )
      )
    );

    // Assert
    expect(await reservedKeyCount(tn.org.id)).toBe(2);
    const org = await h.db(TableName.Organization).where({ id: tn.org.id }).first();
    const project = await h.db(TableName.Project).where({ id: tn.project.id }).first();
    expect(org?.kmsDefaultKeyId && org.kmsEncryptedDataKey).toBeTruthy();
    expect(project?.kmsSecretManagerKeyId && project.kmsSecretManagerEncryptedDataKey).toBeTruthy();
  });

  test("should give every concurrent caller ciphers for the same project data key", async () => {
    // Setup
    const tn = await h.newTenant();
    const service = newService();

    // Action
    const pairs = await Promise.all(
      Array.from({ length: 10 }, () =>
        service.createCipherPairWithDataKey({ type: KmsDataKey.SecretManager, projectId: tn.project.id })
      )
    );

    // Assert
    const blob = pairs[0].encryptor({ plainText: Buffer.from("shared") }).cipherTextBlob;
    pairs.forEach((pair) => expect(pair.decryptor({ cipherTextBlob: blob }).toString()).toBe("shared"));
  });

  test("should create exactly one project certificate key under 10 concurrent callers", async () => {
    // Setup
    const tn = await h.newTenant();
    const service = newService();

    // Action
    const ids = await Promise.all(
      Array.from({ length: 10 }, () => service.getProjectCertificateKmsKeyId(tn.project.id))
    );

    // Assert
    expect(new Set(ids).size).toBe(1);
    expect(await reservedKeyCount(tn.org.id)).toBe(1);
  });

  test("should return the certificate key a pod of the previous release already set, creating none", async () => {
    // Setup
    const tn = await h.newTenant();
    const service = newService();
    const [winner] = await h
      .db(TableName.KmsKey)
      .insert({ name: "previous-release", orgId: tn.org.id, isReserved: true })
      .returning("id");

    // Action
    await h.db(TableName.Project).where({ id: tn.project.id }).update({ kmsCertificateKeyId: winner.id });
    const id = await service.getProjectCertificateKmsKeyId(tn.project.id);

    // Assert
    expect(id).toBe(winner.id);
    expect(await reservedKeyCount(tn.org.id)).toBe(1);
  });

  test("should wait on the lock id pods of the previous release take before creating the org key", async () => {
    // Setup
    const tn = await h.newTenant();
    const service = newService();
    const lockId = pgAdvisoryLockHashText(`kms-org-key:${tn.org.id}`);
    const legacyHolder = await h.db.transaction();
    await legacyHolder.raw("SELECT pg_advisory_xact_lock(?)", [lockId]);

    // Action
    let created = false;
    const pending = service
      .createCipherPairWithDataKey({ type: KmsDataKey.Organization, orgId: tn.org.id })
      .then(() => {
        created = true;
      });
    await waitForAdvisoryLockWaiter(lockId);
    const createdWhileHeld = created;
    await legacyHolder.commit();
    await pending;

    // Assert
    expect(createdWhileHeld).toBe(false);
    expect(created).toBe(true);
  });

  test("should leave a project on its internal key when asked to switch to an internal key", async () => {
    // Setup
    const tn = await h.newTenant();
    const service = newService();
    const before = await service.getProjectSecretManagerKmsKeyId(tn.project.id);

    // Action
    const result = await service.updateProjectSecretManagerKmsKey({
      projectId: tn.project.id,
      kms: { type: KmsType.Internal }
    });

    // Assert
    expect(result).toMatchObject({ id: before, isExternal: false });
    expect(await service.getProjectSecretManagerKmsKeyId(tn.project.id)).toBe(before);
  });

  test("should restore a backup into a new key that decrypts the project's data", async () => {
    // Setup
    const tn = await h.newTenant();
    const service = newService();
    const cipher = await service.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId: tn.project.id
    });
    const blob = cipher.encryptor({ plainText: Buffer.from("backed up") }).cipherTextBlob;
    const { secretManager } = await service.getProjectKeyBackup(tn.project.id);

    // Action
    const { secretManagerKmsKey } = await service.loadProjectKeyBackup(tn.project.id, secretManager);
    const restored = await service.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId: tn.project.id
    });

    // Assert
    expect(await service.getProjectSecretManagerKmsKeyId(tn.project.id)).toBe(secretManagerKmsKey.id);
    expect(restored.decryptor({ cipherTextBlob: blob }).toString()).toBe("backed up");
  });

  test("should delete a project's reserved keys only once nothing references them", async () => {
    // Setup
    const tn = await h.newTenant();
    const service = newService();
    const certificateKeyId = await service.getProjectCertificateKmsKeyId(tn.project.id);
    const { project: other } = await h.factories.project({ orgId: tn.org.id });
    await h.db(TableName.Project).where({ id: other.id }).update({ kmsCertificateKeyId: certificateKeyId });

    // Action
    await h.db(TableName.Project).where({ id: tn.project.id }).delete();
    await service.deleteProjectKeys({ orgId: tn.org.id, kmsKeyIds: [certificateKeyId] });

    // Assert
    expect(await h.db(TableName.KmsKey).where({ id: certificateKeyId }).first()).toBeTruthy();
  });

  test("should delete a reserved key nothing references", async () => {
    // Setup
    const tn = await h.newTenant();
    const service = newService();
    const certificateKeyId = await service.getProjectCertificateKmsKeyId(tn.project.id);
    await h.db(TableName.Project).where({ id: tn.project.id }).delete();

    // Action
    await service.deleteProjectKeys({ orgId: tn.org.id, kmsKeyIds: [certificateKeyId] });

    // Assert
    expect(await h.db(TableName.KmsKey).where({ id: certificateKeyId }).first()).toBeUndefined();
  });

  test("should refuse a key switch to a key of another org and change nothing", async () => {
    // Setup
    const tn = await h.newTenant();
    const otherTenant = await h.newTenant();
    const service = newService();
    const otherKeyId = await service.getProjectSecretManagerKmsKeyId(otherTenant.project.id);
    const before = await service.getProjectSecretManagerKmsKeyId(tn.project.id);

    // Action
    const result = service.updateProjectSecretManagerKmsKey({
      projectId: tn.project.id,
      kms: { type: KmsType.External, kmsId: otherKeyId }
    });

    // Assert
    await expect(result).rejects.toThrow("KMS ID does not belong in the organization.");
    expect(await service.getProjectSecretManagerKmsKeyId(tn.project.id)).toBe(before);
  });

  test("should read a project it just created from the primary when asked to", async () => {
    // Setup
    const tn = await h.newTenant();
    const service = newService();

    // Action
    const cipher = await service.createCipherPairWithDataKey(
      { type: KmsDataKey.SecretManager, projectId: tn.project.id },
      { readFrom: ReadFrom.Primary }
    );

    // Assert
    expect(cipher.encryptor({ plainText: Buffer.from("v") }).cipherTextBlob.length).toBeGreaterThan(0);
  });
});
