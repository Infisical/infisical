import { TableName } from "@app/db/schemas";
import { setupIntegration } from "@app/domains/lib/testing/integration";
import { DatabaseErrorCode } from "@app/lib/error-codes";
import { DatabaseError } from "@app/lib/errors";

import { buildKmsCoreStoreAccess } from "../../data-access/kms-core-stores";
import { RootKey } from "../../models/root-key";
import { TKmsDataKeyService } from "../data-key/service";
import { KmsKeyService } from "./service";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

describe("KmsKeyService on Postgres", () => {
  const h = setupIntegration();

  const newService = () => {
    const { transactionRunner, stores } = buildKmsCoreStoreAccess(h.db, () => h.db);
    return new KmsKeyService(
      transactionRunner,
      stores,
      RootKey.generate(),
      undefined,
      {} as unknown as TKmsDataKeyService
    );
  };

  // Saving writes every attribute it read, so an edit that read before a concurrent one committed would write
  // that one's change back. The row lock makes the second edit read after the first commits.
  test("should keep a concurrent edit to the key's attributes", async () => {
    // Setup
    const tn = await h.newTenant();
    const kms = newService();
    const key = await kms.generateKmsKey({ orgId: tn.org.id, projectId: tn.project.id, isReserved: false, name: "k" });
    const concurrent = await h.db.transaction();
    await concurrent(TableName.KmsKey).where({ id: key.id }).forUpdate().first("id");
    await concurrent(TableName.KmsKey).where({ id: key.id }).update({ isDisabled: true });

    // Action
    const rename = kms.updateKeyAttributes(key.id, { name: "renamed" });
    let waiting = 0;
    while (waiting === 0) {
      // eslint-disable-next-line no-await-in-loop -- polls until the rename is blocked on the row lock
      const { rows } = await h.db.raw<{ rows: { count: string }[] }>(
        "SELECT count(*) FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND datname = current_database()"
      );
      waiting = Number(rows[0].count);
    }
    await concurrent.commit();
    await rename;

    // Assert
    const stored = await h.db(TableName.KmsKey).where({ id: key.id }).first("name", "isDisabled");
    expect(stored).toEqual({ name: "renamed", isDisabled: true });
  });

  test("should give two concurrent rotations versions 2 and 3 and keep every ciphertext readable", async () => {
    // Setup
    const tn = await h.newTenant();
    const kms = newService();
    const key = await kms.generateKmsKey({
      orgId: tn.org.id,
      projectId: tn.project.id,
      isReserved: false,
      name: "rotating"
    });
    const encryptBefore = await kms.encryptWithKmsKey({ kmsId: key.id });
    const before = await encryptBefore({ plainText: Buffer.from("v1") });

    // Action
    const versions = await Promise.all([kms.rotateKmsKey(key.id), kms.rotateKmsKey(key.id)]);
    const encryptAfter = await kms.encryptWithKmsKey({ kmsId: key.id });
    const after = await encryptAfter({ plainText: Buffer.from("v3") });

    // Assert
    expect(versions.map(({ version }) => version).sort()).toEqual([2, 3]);
    const decrypt = await kms.decryptWithKmsKey({ kmsId: key.id });
    expect((await decrypt(before)).toString()).toBe("v1");
    expect((await decrypt(after)).toString()).toBe("v3");
  });

  test("should delete a key's archived versions with it", async () => {
    // Setup
    const tn = await h.newTenant();
    const kms = newService();
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
    const kms = newService();
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
    const kms = newService();
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

  // Callers (CMEK, KMIP) turn this unique violation into their own message.
  test("should reject a duplicate key name in the same project with the unique violation", async () => {
    // Setup
    const tn = await h.newTenant();
    const kms = newService();
    await kms.generateKmsKey({ orgId: tn.org.id, projectId: tn.project.id, isReserved: false, name: "dup" });

    // Action
    const result = kms.generateKmsKey({ orgId: tn.org.id, projectId: tn.project.id, isReserved: false, name: "dup" });

    // Assert
    await expect(result).rejects.toBeInstanceOf(DatabaseError);
    await expect(result).rejects.toMatchObject({ error: { code: DatabaseErrorCode.UniqueViolation } });
  });

  test("should read a just-written key from the primary", async () => {
    // Setup
    const tn = await h.newTenant();
    const kms = newService();
    const key = await kms.generateKmsKey({ orgId: tn.org.id, projectId: tn.project.id, isReserved: false, name: "p" });
    await kms.updateKeyAttributes(key.id, { isPublicKeyPublished: true });

    // Action
    const published = await kms.findPublishedKeyById(key.id);

    // Assert
    expect(published?.id).toBe(key.id);
  });
});
