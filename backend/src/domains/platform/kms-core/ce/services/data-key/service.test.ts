import { InMemoryKeyStore } from "@app/domains/lib/key-store/testing/in-memory-key-store";

import { ProjectDataKeyCache, projectDataKeyCacheKey } from "../../data-access/project-data-key-cache";
import { EncryptedDataKey } from "../../models/encrypted-data-key";
import { KmsKey } from "../../models/kms-key";
import { ProjectKey } from "../../models/project-key";
import { RootKey } from "../../models/root-key";
import { InMemoryKmsCoreStores } from "../../testing/in-memory-kms-core-stores";
import { TInMemoryProjectRow } from "../../testing/in-memory-platform-rows";
import { TExternalKmsHook, TKmsCoreStores, TProjectKeyStore } from "../dependencies";
import { ReadFrom } from "../helpers/read-options";
import { DataKeyService, KmsDataKey, KmsType } from "./service";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

const EXTERNAL_PREFIX = Buffer.from("external:");

const fakeExternalKms = (): TExternalKmsHook => ({
  encrypt: async (_key, _orgCipher, plainText) => Buffer.concat([EXTERNAL_PREFIX, plainText]),
  decrypt: async (_key, _orgCipher, cipherTextBlob) => Buffer.from(cipherTextBlob.subarray(EXTERNAL_PREFIX.length)),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  get: vi.fn(),
  list: vi.fn(),
  fetchGcpKeys: vi.fn()
});

const build = (externalKms?: TExternalKmsHook) => {
  const mem = new InMemoryKmsCoreStores();
  mem.platformRows.addProject("project-1", "org-1");
  const rootKey = RootKey.generate();
  const service = new DataKeyService(mem.transactionRunner, mem.stores, rootKey, externalKms);
  return { mem, rootKey, service };
};

const buildCached = (externalKms?: TExternalKmsHook) => {
  const mem = new InMemoryKmsCoreStores();
  mem.platformRows.addProject("project-1", "org-1");
  const rootKey = RootKey.generate();
  const keyStore = new InMemoryKeyStore();
  const cache = new ProjectDataKeyCache(keyStore);
  const service = new DataKeyService(mem.transactionRunner, mem.stores, rootKey, externalKms, cache);
  return { mem, rootKey, keyStore, cache, service };
};

const cachedEntry = async (keyStore: InMemoryKeyStore, projectId = "project-1") => {
  const raw = await keyStore.getItem(projectDataKeyCacheKey(projectId));
  return raw ? (JSON.parse(raw) as Record<string, string | null>) : null;
};

const externalKeyIn = async (mem: InMemoryKmsCoreStores) => {
  const external = KmsKey.createExternal({
    orgId: "org-1",
    name: "external",
    provider: "aws",
    encryptedProviderInputs: Buffer.from("inputs")
  });
  await mem.kmsKeyStore.insert(external);
  return external;
};

// A replica that has not caught up with a project committed a moment ago.
const withLaggingReplica = (mem: InMemoryKmsCoreStores, projectId: string) => {
  const projectKeyStore = Object.create(mem.projectKeyStore) as TProjectKeyStore;
  projectKeyStore.find = async (id: string) => (id === projectId ? null : mem.projectKeyStore.find(id));
  const replica: TKmsCoreStores = { ...mem.stores, projectKeyStore };
  return new DataKeyService(mem.transactionRunner, replica, RootKey.generate(), undefined);
};

const setProjectRow = (mem: InMemoryKmsCoreStores, projectId: string, patch: Partial<TInMemoryProjectRow>) => {
  const row = mem.platformRows.projects.get(projectId);
  if (!row) throw new Error(`project ${projectId} not in memory`);
  mem.platformRows.projects.set(projectId, { ...row, ...patch });
};

const keysOf = (mem: InMemoryKmsCoreStores, orgId: string) => mem.kmsKeyStore.find({ orgId });

const projectCipher = (service: DataKeyService, projectId = "project-1") =>
  service.createCipherPairWithDataKey({ type: KmsDataKey.SecretManager, projectId });

const seal = (cipher: Awaited<ReturnType<typeof projectCipher>>, text: string) =>
  cipher.encryptor({ plainText: Buffer.from(text) }).cipherTextBlob;

describe("DataKeyService.createCipherPairWithDataKey", () => {
  test("should create the org key and data key once for concurrent first callers", async () => {
    // Setup
    const { mem, service } = build();

    // Action
    const pairs = await Promise.all(
      Array.from({ length: 10 }, () =>
        service.createCipherPairWithDataKey({ type: KmsDataKey.Organization, orgId: "org-1" })
      )
    );

    // Assert
    expect(await keysOf(mem, "org-1")).toHaveLength(1);
    const blob = seal(pairs[0], "shared");
    pairs.forEach((pair) => expect(pair.decryptor({ cipherTextBlob: blob }).toString()).toBe("shared"));
  });

  test("should create the project key and data key once for concurrent first callers", async () => {
    // Setup
    const { mem, service } = build();

    // Action
    const pairs = await Promise.all(Array.from({ length: 10 }, () => projectCipher(service)));

    // Assert
    expect(await keysOf(mem, "org-1")).toHaveLength(1);
    const blob = seal(pairs[0], "shared");
    pairs.forEach((pair) => expect(pair.decryptor({ cipherTextBlob: blob }).toString()).toBe("shared"));
  });

  test("should hand the same data key to a later caller", async () => {
    // Setup
    const { service } = build();
    const first = await projectCipher(service);

    // Action
    const second = await projectCipher(service);

    // Assert
    expect(second.decryptor({ cipherTextBlob: seal(first, "v") }).toString()).toBe("v");
  });

  test("should refuse a project it does not know and create nothing", async () => {
    // Setup
    const { mem, service } = build();

    // Action
    const result = projectCipher(service, "missing");

    // Assert
    await expect(result).rejects.toThrow("Project with ID 'missing' not found");
    expect(await mem.kmsKeyStore.find({})).toHaveLength(0);
  });

  test("should refuse an org it does not know and create nothing", async () => {
    // Setup
    const { mem, service } = build();

    // Action
    const result = service.createCipherPairWithDataKey({ type: KmsDataKey.Organization, orgId: "missing" });

    // Assert
    await expect(result).rejects.toThrow("Organization with ID 'missing' not found");
    expect(await mem.kmsKeyStore.find({})).toHaveLength(0);
  });

  test("should read a project its caller has just created from the primary when asked to", async () => {
    // Setup
    const { mem } = build();
    mem.platformRows.addProject("project-new", "org-1");
    const service = withLaggingReplica(mem, "project-new");

    // Action
    const cipher = await service.createCipherPairWithDataKey(
      { type: KmsDataKey.SecretManager, projectId: "project-new" },
      { readFrom: ReadFrom.Primary }
    );

    // Assert
    expect(seal(cipher, "v").length).toBeGreaterThan(0);
  });

  test("should refuse a project the replica does not have yet when the caller did not ask for the primary", async () => {
    // Setup
    const { mem } = build();
    mem.platformRows.addProject("project-new", "org-1");
    const service = withLaggingReplica(mem, "project-new");

    // Action
    const result = projectCipher(service, "project-new");

    // Assert
    await expect(result).rejects.toThrow("Project with ID 'project-new' not found");
  });

  test("should read the project again from the primary when its key was removed after the first read", async () => {
    // Setup
    const { mem, service } = build();
    const first = await projectCipher(service);
    const current = (await mem.projectKeyStore.find("project-1")) as ProjectKey;
    const stale = ProjectKey.restore({ ...current.toJSON(), kmsKeyId: "a-key-that-was-deleted" });
    const find = vi.spyOn(mem.projectKeyStore, "find").mockResolvedValueOnce(stale);

    // Action
    const second = await projectCipher(service);

    // Assert
    expect(find).toHaveBeenCalledTimes(2);
    expect(second.decryptor({ cipherTextBlob: seal(first, "v") }).toString()).toBe("v");
  });

  test("should refuse when the key is missing and the project still names it after the second read", async () => {
    // Setup
    const { mem, service } = build();
    await projectCipher(service);
    setProjectRow(mem, "project-1", { kmsSecretManagerKeyId: "a-key-that-was-deleted" });

    // Action
    const result = projectCipher(service);

    // Assert
    await expect(result).rejects.toThrow("KMS with ID 'a-key-that-was-deleted' not found");
  });

  test("should read the project row once for a project whose keys exist", async () => {
    // Setup
    const { mem, service } = build();
    const first = await projectCipher(service);
    const find = vi.spyOn(mem.projectKeyStore, "find");

    // Action
    const second = await projectCipher(service);

    // Assert
    expect(find).toHaveBeenCalledTimes(1);
    expect(second.decryptor({ cipherTextBlob: seal(first, "v") }).toString()).toBe("v");
  });
});

describe("DataKeyService.getProjectSecretManagerKmsKeyId", () => {
  test("should create the project key on first use and return it afterwards", async () => {
    // Setup
    const { mem, service } = build();
    const first = await service.getProjectSecretManagerKmsKeyId("project-1");

    // Action
    const second = await service.getProjectSecretManagerKmsKeyId("project-1");

    // Assert
    expect(second).toBe(first);
    expect(await keysOf(mem, "org-1")).toHaveLength(1);
  });
});

describe("DataKeyService.getProjectCertificateKmsKeyId", () => {
  test("should create the project certificate key on first use and return it afterwards", async () => {
    // Setup
    const { mem, service } = build();
    const first = await service.getProjectCertificateKmsKeyId("project-1");

    // Action
    const second = await service.getProjectCertificateKmsKeyId("project-1");

    // Assert
    expect(second).toBe(first);
    expect(await keysOf(mem, "org-1")).toHaveLength(1);
  });

  test("should return the key another writer set first and keep none of its own", async () => {
    // Setup
    const { mem, service } = build();
    const winner = KmsKey.createReserved({ orgId: "org-1", rootKey: RootKey.generate() });
    await mem.kmsKeyStore.insert(winner);
    const find = mem.projectKeyStore.find.bind(mem.projectKeyStore);
    vi.spyOn(mem.projectKeyStore, "find").mockImplementationOnce(async (projectId) => {
      const read = await find(projectId);
      setProjectRow(mem, "project-1", { kmsCertificateKeyId: winner.id });
      return read;
    });

    // Action
    const id = await service.getProjectCertificateKmsKeyId("project-1");

    // Assert
    expect(id).toBe(winner.id);
    expect(await keysOf(mem, "org-1")).toHaveLength(1);
  });

  test("should refuse a project it does not know", async () => {
    // Setup
    const { service } = build();

    // Action
    const result = service.getProjectCertificateKmsKeyId("missing");

    // Assert
    await expect(result).rejects.toThrow("Project with ID 'missing' not found");
  });
});

describe("DataKeyService.wrapKey and unwrapKey", () => {
  test("should unwrap a key for the label it was wrapped with", async () => {
    // Setup
    const { service } = build();
    const key = Buffer.alloc(32, 7);
    const wrappedKey = await service.wrapKey({ projectId: "project-1", label: "session-1", key });

    // Action
    const opened = await service.unwrapKey({ projectId: "project-1", label: "session-1", wrappedKey, keyBytes: 32 });

    // Assert
    expect(opened?.equals(key)).toBe(true);
  });

  test("should return null for another label", async () => {
    // Setup
    const { service } = build();
    const wrappedKey = await service.wrapKey({ projectId: "project-1", label: "session-1", key: Buffer.alloc(32, 7) });

    // Action
    const opened = await service.unwrapKey({ projectId: "project-1", label: "session-2", wrappedKey, keyBytes: 32 });

    // Assert
    expect(opened).toBeNull();
  });
});

describe("DataKeyService.updateProjectSecretManagerKmsKey", () => {
  test("should leave a project on its internal key when asked to switch to an internal key", async () => {
    // Setup
    const { service } = build();
    const before = await service.getProjectSecretManagerKmsKeyId("project-1");

    // Action
    const result = await service.updateProjectSecretManagerKmsKey({
      projectId: "project-1",
      kms: { type: KmsType.Internal }
    });

    // Assert
    expect(result).toMatchObject({ id: before, isExternal: false });
    expect(await service.getProjectSecretManagerKmsKeyId("project-1")).toBe(before);
  });

  test("should re-wrap the data key under an external key so existing ciphertext stays readable", async () => {
    // Setup
    const { mem, service } = build(fakeExternalKms());
    await service.createCipherPairWithDataKey({ type: KmsDataKey.Organization, orgId: "org-1" });
    const before = await projectCipher(service);
    const blob = seal(before, "kept");
    const oldKeyId = await service.getProjectSecretManagerKmsKeyId("project-1");
    const external = KmsKey.createExternal({
      orgId: "org-1",
      name: "external",
      provider: "aws",
      encryptedProviderInputs: Buffer.from("inputs")
    });
    await mem.kmsKeyStore.insert(external);

    // Action
    const result = await service.updateProjectSecretManagerKmsKey({
      projectId: "project-1",
      kms: { type: KmsType.External, kmsId: external.id }
    });

    // Assert
    expect(result.id).toBe(external.id);
    expect(await service.getProjectSecretManagerKmsKeyId("project-1")).toBe(external.id);
    expect(await mem.kmsKeyStore.findById(oldKeyId)).toBeNull();
    const after = await projectCipher(service);
    expect(after.decryptor({ cipherTextBlob: blob }).toString()).toBe("kept");
  });

  test("should switch an external project back to a new internal key and keep the data readable", async () => {
    // Setup
    const { mem, service } = build(fakeExternalKms());
    await service.createCipherPairWithDataKey({ type: KmsDataKey.Organization, orgId: "org-1" });
    const blob = seal(await projectCipher(service), "kept");
    const external = KmsKey.createExternal({
      orgId: "org-1",
      name: "external",
      provider: "aws",
      encryptedProviderInputs: Buffer.from("inputs")
    });
    await mem.kmsKeyStore.insert(external);
    await service.updateProjectSecretManagerKmsKey({
      projectId: "project-1",
      kms: { type: KmsType.External, kmsId: external.id }
    });

    // Action
    const result = await service.updateProjectSecretManagerKmsKey({
      projectId: "project-1",
      kms: { type: KmsType.Internal }
    });

    // Assert
    expect(result.id).not.toBe(external.id);
    expect(await service.getProjectSecretManagerKmsKeyId("project-1")).toBe(result.id);
    expect(await mem.kmsKeyStore.findById(external.id)).not.toBeNull();
    expect((await projectCipher(service)).decryptor({ cipherTextBlob: blob }).toString()).toBe("kept");
  });

  test("should refuse a key switch to a key of another org and change nothing", async () => {
    // Setup
    const { mem, service } = build();
    mem.platformRows.addProject("project-2", "org-2");
    const otherKeyId = await service.getProjectSecretManagerKmsKeyId("project-2");
    const before = await service.getProjectSecretManagerKmsKeyId("project-1");

    // Action
    const result = service.updateProjectSecretManagerKmsKey({
      projectId: "project-1",
      kms: { type: KmsType.External, kmsId: otherKeyId }
    });

    // Assert
    await expect(result).rejects.toThrow("KMS ID does not belong in the organization.");
    expect(await service.getProjectSecretManagerKmsKeyId("project-1")).toBe(before);
  });

  test("should refuse a key that does not exist", async () => {
    // Setup
    const { service } = build();

    // Action
    const result = service.updateProjectSecretManagerKmsKey({
      projectId: "project-1",
      kms: { type: KmsType.External, kmsId: "missing" }
    });

    // Assert
    await expect(result).rejects.toThrow("KMS with ID 'missing' not found");
  });

  test("should refuse an external key when the enterprise hook is missing and change nothing", async () => {
    // Setup
    const { mem, service } = build();
    await service.createCipherPairWithDataKey({ type: KmsDataKey.Organization, orgId: "org-1" });
    const before = await service.getProjectSecretManagerKmsKeyId("project-1");
    const external = KmsKey.createExternal({
      orgId: "org-1",
      name: "external",
      provider: "aws",
      encryptedProviderInputs: Buffer.from("inputs")
    });
    await mem.kmsKeyStore.insert(external);

    // Action
    const result = service.updateProjectSecretManagerKmsKey({
      projectId: "project-1",
      kms: { type: KmsType.External, kmsId: external.id }
    });

    // Assert
    await expect(result).rejects.toThrow("External KMS keys require the Infisical enterprise edition.");
    expect(await service.getProjectSecretManagerKmsKeyId("project-1")).toBe(before);
  });

  test("should leave the project unchanged when its key changed during the switch", async () => {
    // Setup
    const { mem, service } = build(fakeExternalKms());
    await service.createCipherPairWithDataKey({ type: KmsDataKey.Organization, orgId: "org-1" });
    await projectCipher(service);
    const original = await service.getProjectSecretManagerKmsKeyId("project-1");
    const external = KmsKey.createExternal({
      orgId: "org-1",
      name: "external",
      provider: "aws",
      encryptedProviderInputs: Buffer.from("inputs")
    });
    await mem.kmsKeyStore.insert(external);
    vi.spyOn(mem.projectKeyStore, "switchKey").mockResolvedValueOnce(false);

    // Action
    const result = service.updateProjectSecretManagerKmsKey({
      projectId: "project-1",
      kms: { type: KmsType.External, kmsId: external.id }
    });

    // Assert
    await expect(result).rejects.toThrow("left unchanged. Retry the change.");
    expect(await service.getProjectSecretManagerKmsKeyId("project-1")).toBe(original);
    expect(await mem.kmsKeyStore.findById(original)).not.toBeNull();
  });
});

describe("DataKeyService project key backup", () => {
  test("should restore a backup into a new key that decrypts the project's data", async () => {
    // Setup
    const { service } = build();
    const blob = seal(await projectCipher(service), "backed up");
    const { secretManager } = await service.getProjectKeyBackup("project-1");
    const before = await service.getProjectSecretManagerKmsKeyId("project-1");

    // Action
    const { secretManagerKmsKey } = await service.loadProjectKeyBackup("project-1", secretManager);

    // Assert
    expect(secretManagerKmsKey.id).not.toBe(before);
    expect(await service.getProjectSecretManagerKmsKeyId("project-1")).toBe(secretManagerKmsKey.id);
    expect((await projectCipher(service)).decryptor({ cipherTextBlob: blob }).toString()).toBe("backed up");
  });

  test("should refuse a backup of another project", async () => {
    // Setup
    const { mem, service } = build();
    mem.platformRows.addProject("project-2", "org-1");
    const { secretManager } = await service.getProjectKeyBackup("project-2");

    // Action
    const result = service.loadProjectKeyBackup("project-1", secretManager);

    // Assert
    await expect(result).rejects.toThrow("Backup does not belong to project");
  });

  test("should refuse a backup whose key belongs to another org and change nothing", async () => {
    // Setup
    const { mem, service } = build();
    mem.platformRows.addProject("project-2", "org-2");
    const foreign = (await service.getProjectKeyBackup("project-2")).secretManager.split(".");
    const foreignKeyId = foreign[3];
    const { secretManager } = await service.getProjectKeyBackup("project-1");
    const parts = secretManager.split(".");
    parts[3] = foreignKeyId;
    const forged = parts.slice(0, -1).join(".");
    const { createHash } = await import("node:crypto");
    const backup = `${forged}.${createHash("sha256").update(forged).digest("hex")}`;
    const before = await service.getProjectSecretManagerKmsKeyId("project-1");

    // Action
    const result = service.loadProjectKeyBackup("project-1", backup);

    // Assert
    await expect(result).rejects.toThrow("Backup does not belong to project");
    expect(await service.getProjectSecretManagerKmsKeyId("project-1")).toBe(before);
  });

  test("should refuse a backup that was altered", async () => {
    // Setup
    const { service } = build();
    const { secretManager } = await service.getProjectKeyBackup("project-1");

    // Action
    const result = service.loadProjectKeyBackup("project-1", `${secretManager}0`);

    // Assert
    await expect(result).rejects.toThrow("Invalid backup");
  });
});

describe("DataKeyService.deleteProjectKeys", () => {
  test("should refuse a key of another org and keep it", async () => {
    // Setup
    const { mem, service } = build();
    const keyId = await service.getProjectCertificateKmsKeyId("project-1");
    mem.platformRows.projects.delete("project-1");

    // Action
    const result = service.deleteProjectKeys({ orgId: "org-2", kmsKeyIds: [keyId] });

    // Assert
    await expect(result).rejects.toThrow("KMS doesn't belong to organization");
    expect(await mem.kmsKeyStore.findById(keyId)).not.toBeNull();
  });

  test("should delete the reserved key once the project is gone", async () => {
    // Setup
    const { mem, service } = build();
    const keyId = await service.getProjectCertificateKmsKeyId("project-1");
    mem.platformRows.projects.delete("project-1");

    // Action
    await service.deleteProjectKeys({ orgId: "org-1", kmsKeyIds: [keyId] });

    // Assert
    expect(await mem.kmsKeyStore.findById(keyId)).toBeNull();
  });

  test("should keep a reserved key another project still references", async () => {
    // Setup
    const { mem, service } = build();
    const keyId = await service.getProjectCertificateKmsKeyId("project-1");
    mem.platformRows.addProject("project-2", "org-1", { kmsCertificateKeyId: keyId });

    // Action
    await service.deleteProjectKeys({ orgId: "org-1", kmsKeyIds: [keyId] });

    // Assert
    expect(await mem.kmsKeyStore.findById(keyId)).not.toBeNull();
  });

  test("should keep a key the org still uses", async () => {
    // Setup
    const { mem, service } = build();
    await service.createCipherPairWithDataKey({ type: KmsDataKey.Organization, orgId: "org-1" });
    const [orgKey] = await keysOf(mem, "org-1");

    // Action
    await service.deleteProjectKeys({ orgId: "org-1", kmsKeyIds: [orgKey.id] });

    // Assert
    expect(await mem.kmsKeyStore.findById(orgKey.id)).not.toBeNull();
  });

  test("should keep a key that is not Infisical-managed", async () => {
    // Setup
    const { mem, service } = build();
    const external = KmsKey.createExternal({
      orgId: "org-1",
      name: "external",
      provider: "aws",
      encryptedProviderInputs: Buffer.from("inputs")
    });
    await mem.kmsKeyStore.insert(external);

    // Action
    await service.deleteProjectKeys({ orgId: "org-1", kmsKeyIds: [external.id] });

    // Assert
    expect(await mem.kmsKeyStore.findById(external.id)).not.toBeNull();
  });
});

describe("DataKeyService project data key cache", () => {
  test("should serve a second cipher pair from the cache without reading the project or using the primary", async () => {
    // Setup
    const { mem, service } = buildCached();
    const first = await projectCipher(service);
    const find = vi.spyOn(mem.projectKeyStore, "find");
    const run = vi.spyOn(mem.transactionRunner, "run");

    // Action
    const second = await projectCipher(service);

    // Assert
    expect(find).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
    expect(second.decryptor({ cipherTextBlob: seal(first, "v") }).toString()).toBe("v");
  });

  test("should fill a miss from the primary and write the project's current entry", async () => {
    // Setup
    const { mem, keyStore, service } = buildCached();
    const run = vi.spyOn(mem.transactionRunner, "run");

    // Action
    await projectCipher(service);

    // Assert
    expect(run).toHaveBeenCalled();
    const project = mem.platformRows.projects.get("project-1");
    expect(await cachedEntry(keyStore)).toEqual({
      kmsSecretManagerKeyId: project?.kmsSecretManagerKeyId,
      kmsSecretManagerEncryptedDataKey: project?.kmsSecretManagerEncryptedDataKey?.toString("base64"),
      orgId: "org-1"
    });
  });

  test("should drop the entry a miss wrote when a key switch committed while it was reading", async () => {
    // Setup
    const { mem, keyStore, service } = buildCached();
    await projectCipher(service);
    await keyStore.deleteItem(projectDataKeyCacheKey("project-1"));
    const write = keyStore.setItemWithExpiry.bind(keyStore);
    vi.spyOn(keyStore, "setItemWithExpiry").mockImplementationOnce(async (...args) => {
      const result = await write(...args);
      const row = mem.platformRows.projects.get("project-1");
      if (row) mem.platformRows.projects.set("project-1", { ...row, kmsSecretManagerKeyId: "switched-key" });
      return result;
    });

    // Action
    await projectCipher(service);

    // Assert
    expect(await keyStore.getItem(projectDataKeyCacheKey("project-1"))).toBeNull();
  });

  test("should overwrite a partial entry written by a pod of the previous release", async () => {
    // Setup
    const { mem, keyStore, service } = buildCached();
    await keyStore.setItemWithExpiry(
      projectDataKeyCacheKey("project-1"),
      300,
      JSON.stringify({ kmsSecretManagerKeyId: null, kmsSecretManagerEncryptedDataKey: null, orgId: "org-1" })
    );

    // Action
    await projectCipher(service);

    // Assert
    const project = mem.platformRows.projects.get("project-1");
    expect(await cachedEntry(keyStore)).toMatchObject({ kmsSecretManagerKeyId: project?.kmsSecretManagerKeyId });
  });

  test("should replace an entry naming a deleted KMS key from the primary, check it again after writing, and rewrite it", async () => {
    // Setup
    const { mem, keyStore, cache, service } = buildCached();
    const blob = seal(await projectCipher(service), "kept");
    const current = (await mem.projectKeyStore.find("project-1")) as ProjectKey;
    await cache.set(
      "project-1",
      EncryptedDataKey.restore({
        kmsKeyId: "a-key-that-was-deleted",
        encryptedDataKey: current.material().encryptedDataKey,
        orgId: "org-1"
      })
    );
    const find = vi.spyOn(mem.projectKeyStore, "find");

    // Action
    const healed = await projectCipher(service);

    // Assert
    expect(find).toHaveBeenCalledTimes(2);
    expect(healed.decryptor({ cipherTextBlob: blob }).toString()).toBe("kept");
    expect(await cachedEntry(keyStore)).toMatchObject({ kmsSecretManagerKeyId: current.currentKmsKeyId });
  });

  test("should replace an entry whose ciphertext does not open under its KMS key", async () => {
    // Setup
    const { mem, keyStore, cache, service } = buildCached();
    const blob = seal(await projectCipher(service), "kept");
    const current = (await mem.projectKeyStore.find("project-1")) as ProjectKey;
    await cache.set(
      "project-1",
      EncryptedDataKey.restore({
        kmsKeyId: current.currentKmsKeyId as string,
        encryptedDataKey: Buffer.alloc(64, 9),
        orgId: "org-1"
      })
    );

    // Action
    const healed = await projectCipher(service);

    // Assert
    expect(healed.decryptor({ cipherTextBlob: blob }).toString()).toBe("kept");
    expect(await cachedEntry(keyStore)).toMatchObject({
      kmsSecretManagerEncryptedDataKey: current.material().encryptedDataKey.toString("base64")
    });
  });

  test("should neither read nor write the cache for a read from the primary", async () => {
    // Setup
    const { cache, keyStore, service } = buildCached();
    const get = vi.spyOn(cache, "get");
    const set = vi.spyOn(cache, "set");

    // Action
    await service.createCipherPairWithDataKey(
      { type: KmsDataKey.SecretManager, projectId: "project-1" },
      { readFrom: ReadFrom.Primary }
    );

    // Assert
    expect(get).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
    expect(await cachedEntry(keyStore)).toBeNull();
  });

  test("should not use the cache for an org data key", async () => {
    // Setup
    const { cache, service } = buildCached();
    const get = vi.spyOn(cache, "get");
    const set = vi.spyOn(cache, "set");

    // Action
    await service.createCipherPairWithDataKey({ type: KmsDataKey.Organization, orgId: "org-1" });

    // Assert
    expect(get).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });

  test("should evict after a switch to an external key has committed", async () => {
    // Setup
    const { mem, keyStore, cache, service } = buildCached(fakeExternalKms());
    await service.createCipherPairWithDataKey({ type: KmsDataKey.Organization, orgId: "org-1" });
    const blob = seal(await projectCipher(service), "kept");
    const external = await externalKeyIn(mem);
    const keyIdAtEviction: Array<string | null | undefined> = [];
    const evict = vi.spyOn(cache, "evict").mockImplementation(async (projectId) => {
      keyIdAtEviction.push(mem.platformRows.projects.get(projectId)?.kmsSecretManagerKeyId);
      await keyStore.deleteItem(projectDataKeyCacheKey(projectId));
    });

    // Action
    await service.updateProjectSecretManagerKmsKey({
      projectId: "project-1",
      kms: { type: KmsType.External, kmsId: external.id }
    });

    // Assert
    expect(evict).toHaveBeenCalledExactlyOnceWith("project-1");
    expect(keyIdAtEviction).toEqual([external.id]);
    expect(await cachedEntry(keyStore)).toBeNull();
    expect((await projectCipher(service)).decryptor({ cipherTextBlob: blob }).toString()).toBe("kept");
    expect(await cachedEntry(keyStore)).toMatchObject({ kmsSecretManagerKeyId: external.id });
  });

  test("should not evict when the switch did not commit", async () => {
    // Setup
    const { mem, cache, service } = buildCached(fakeExternalKms());
    await service.createCipherPairWithDataKey({ type: KmsDataKey.Organization, orgId: "org-1" });
    await projectCipher(service);
    const external = await externalKeyIn(mem);
    vi.spyOn(mem.projectKeyStore, "switchKey").mockResolvedValueOnce(false);
    const evict = vi.spyOn(cache, "evict");

    // Action
    const result = service.updateProjectSecretManagerKmsKey({
      projectId: "project-1",
      kms: { type: KmsType.External, kmsId: external.id }
    });

    // Assert
    await expect(result).rejects.toThrow("left unchanged. Retry the change.");
    expect(evict).not.toHaveBeenCalled();
  });

  test("should evict before a backup restore writes and again after it commits", async () => {
    // Setup
    const { mem, keyStore, cache, service } = buildCached();
    const blob = seal(await projectCipher(service), "backed up");
    const { secretManager } = await service.getProjectKeyBackup("project-1");
    const before = await service.getProjectSecretManagerKmsKeyId("project-1");
    const keyIdAtEviction: Array<string | null | undefined> = [];
    const evict = vi.spyOn(cache, "evict").mockImplementation(async (projectId) => {
      keyIdAtEviction.push(mem.platformRows.projects.get(projectId)?.kmsSecretManagerKeyId);
      await keyStore.deleteItem(projectDataKeyCacheKey(projectId));
    });

    // Action
    const { secretManagerKmsKey } = await service.loadProjectKeyBackup("project-1", secretManager);

    // Assert
    expect(evict).toHaveBeenCalledTimes(2);
    expect(keyIdAtEviction).toEqual([before, secretManagerKmsKey.id]);
    expect((await projectCipher(service)).decryptor({ cipherTextBlob: blob }).toString()).toBe("backed up");
  });

  test("should refuse a backup restore and leave the project unchanged when the eviction fails", async () => {
    // Setup
    const { mem, cache, service } = buildCached();
    await projectCipher(service);
    const { secretManager } = await service.getProjectKeyBackup("project-1");
    const before = await service.getProjectSecretManagerKmsKeyId("project-1");
    const keysBefore = await keysOf(mem, "org-1");
    vi.spyOn(cache, "evict").mockRejectedValue(new Error("Failed to clear the project's cached KMS key."));

    // Action
    const result = service.loadProjectKeyBackup("project-1", secretManager);

    // Assert
    await expect(result).rejects.toThrow("Failed to clear the project's cached KMS key.");
    expect(await service.getProjectSecretManagerKmsKeyId("project-1")).toBe(before);
    expect(await keysOf(mem, "org-1")).toHaveLength(keysBefore.length);
  });

  test("should never touch the cache for a call joined to a caller's transaction", async () => {
    // Setup
    const { mem, keyStore, cache, service } = buildCached();
    const get = vi.spyOn(cache, "get");
    const set = vi.spyOn(cache, "set");
    const evict = vi.spyOn(cache, "evict");

    // Action
    await mem.transactionRunner.run(async ({ tx }) => {
      const joined = service.within(tx);
      await joined.createCipherPairWithDataKey({ type: KmsDataKey.SecretManager, projectId: "project-1" });
      await joined.getProjectSecretManagerKmsKeyId("project-1");
      await joined.getProjectCertificateKmsKeyId("project-1");
    });

    // Assert
    expect(get).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
    expect(evict).not.toHaveBeenCalled();
    expect(await cachedEntry(keyStore)).toBeNull();
  });
});

describe("DataKeyService.within", () => {
  test("should return the winner's certificate key and delete the reserved key it inserted when its claim is lost", async () => {
    // Setup
    const { mem, service } = build();
    const winner = KmsKey.createReserved({ orgId: "org-1", rootKey: RootKey.generate() });
    await mem.kmsKeyStore.insert(winner);
    vi.spyOn(mem.projectKeyStore, "claimCertificateKey").mockImplementationOnce(async () => {
      setProjectRow(mem, "project-1", { kmsCertificateKeyId: winner.id });
      return false;
    });

    // Action
    const id = await mem.transactionRunner.run(({ tx }) =>
      service.within(tx).getProjectCertificateKmsKeyId("project-1")
    );

    // Assert
    expect(id).toBe(winner.id);
    const keys = await keysOf(mem, "org-1");
    expect(keys.map((key) => key.id)).toEqual([winner.id]);
  });
});
