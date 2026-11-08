import { TableName } from "@app/db/schemas";
import { setupIntegration } from "@app/domains/lib/testing/integration";

import { buildPostgresKmsCore } from "../testing/build-postgres-kms-core";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

describe("KmsKeyService on Postgres", () => {
  const h = setupIntegration();

  const startedKms = async () => {
    const module = buildPostgresKmsCore(h.db);
    await module.start({ skipRotationState: true });
    return module.service;
  };

  test("should give two concurrent rotations versions 2 and 3 and keep every ciphertext readable", async () => {
    // Setup
    const tn = await h.newTenant();
    const kms = await startedKms();
    const key = await kms.generateKmsKey({
      orgId: tn.org.id,
      projectId: tn.project.id,
      isReserved: false,
      name: "rotating"
    });
    const before = await (await kms.encryptWithKmsKey({ kmsId: key.id }))({ plainText: Buffer.from("v1") });

    // Action
    const versions = await Promise.all([kms.rotateKmsKey(key.id), kms.rotateKmsKey(key.id)]);
    const after = await (await kms.encryptWithKmsKey({ kmsId: key.id }))({ plainText: Buffer.from("v3") });

    // Assert
    expect(versions.map(({ version }) => version).sort()).toEqual([2, 3]);
    const decrypt = await kms.decryptWithKmsKey({ kmsId: key.id });
    expect((await decrypt(before)).toString()).toBe("v1");
    expect((await decrypt(after)).toString()).toBe("v3");
  });

  test("should delete a key's archived versions with it", async () => {
    // Setup
    const tn = await h.newTenant();
    const kms = await startedKms();
    const key = await kms.generateKmsKey({
      orgId: tn.org.id,
      projectId: tn.project.id,
      isReserved: false,
      name: "versioned"
    });
    await kms.rotateKmsKey(key.id);

    // Action
    await kms.deleteKey(key.id);

    // Assert
    const versions = await h
      .db(TableName.InternalKmsKeyVersion)
      .join(TableName.InternalKms, `${TableName.InternalKms}.id`, `${TableName.InternalKmsKeyVersion}.internalKmsId`)
      .where(`${TableName.InternalKms}.kmsKeyId`, key.id);
    expect(versions).toHaveLength(0);
  });

  test("should page, count and search a project's customer keys in SQL", async () => {
    // Setup
    const tn = await h.newTenant();
    const kms = await startedKms();
    for (const name of ["alpha", "beta", "gamma"]) {
      // eslint-disable-next-line no-await-in-loop
      await kms.generateKmsKey({ orgId: tn.org.id, projectId: tn.project.id, isReserved: false, name });
    }

    // Action
    const page = await kms.listProjectKeys({ projectId: tn.project.id, offset: 1, limit: 1 });
    const pastTheEnd = await kms.listProjectKeys({ projectId: tn.project.id, offset: 10, limit: 1 });
    const searched = await kms.listProjectKeys({ projectId: tn.project.id, search: "amm" });

    // Assert
    expect(page).toMatchObject({ totalCount: 3, keys: [{ name: "beta" }] });
    expect(pastTheEnd).toMatchObject({ totalCount: 3, keys: [] });
    expect(searched.keys.map((key) => key.name)).toEqual(["gamma"]);
  });

  test("should refuse to delete a key with delete protection and keep it", async () => {
    // Setup
    const tn = await h.newTenant();
    const kms = await startedKms();
    const key = await kms.generateKmsKey({
      orgId: tn.org.id,
      projectId: tn.project.id,
      isReserved: false,
      name: "protected",
      hasDeleteProtection: true
    });

    // Action
    const deleted = await kms.deleteKey(key.id);

    // Assert
    expect(deleted).toBeNull();
    expect(await kms.findKeyById(key.id)).toBeTruthy();
  });
});
