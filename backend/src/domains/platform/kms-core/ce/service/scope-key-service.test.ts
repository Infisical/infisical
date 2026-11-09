import { KmsDataKey, ReadFrom, TReadOptions } from "../module";
import { buildInMemoryKmsCore } from "../testing/build-kms-core";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

const started = async () => {
  const built = buildInMemoryKmsCore();
  await built.module.start();
  built.state.addProject("project-1", "org-1");
  return built;
};

describe("ScopeKeyService.createCipherPairWithDataKey", () => {
  test("should create the org key and data key once for concurrent first callers", async () => {
    // Setup
    const { kms, state } = await started();

    // Action
    await Promise.all(
      Array.from({ length: 10 }, () =>
        kms.createCipherPairWithDataKey({ type: KmsDataKey.Organization, orgId: "org-1" })
      )
    );

    // Assert
    expect([...state.tables.kmsKeys.values()].filter((key) => key.orgId === "org-1")).toHaveLength(1);
  });

  test("should refuse a project it does not know and create nothing", async () => {
    // Setup
    const { kms, state } = await started();

    // Action
    const result = kms.createCipherPairWithDataKey({ type: KmsDataKey.SecretManager, projectId: "missing" });

    // Assert
    await expect(result).rejects.toThrow("Project with ID 'missing' not found");
    expect(state.tables.kmsKeys.size).toBe(0);
  });
});

describe("ScopeKeyService reads", () => {
  // A replica that has not caught up with a project committed a moment ago.
  const withLaggingReplica = (built: Awaited<ReturnType<typeof started>>, projectId: string) => {
    const { scopeKeys } = built.dataAccess;
    const findProject = scopeKeys.findProject.bind(scopeKeys);
    return vi
      .spyOn(scopeKeys, "findProject")
      .mockImplementation(async (id: string, options?: TReadOptions) =>
        id === projectId && options?.readFrom !== ReadFrom.Primary ? undefined : findProject(id)
      );
  };

  test("should read a project its caller has just created from the primary when asked to", async () => {
    // Setup
    const built = await started();
    built.state.addProject("project-new", "org-1");
    withLaggingReplica(built, "project-new");

    // Action
    const cipher = await built.kms.createCipherPairWithDataKey(
      { type: KmsDataKey.SecretManager, projectId: "project-new" },
      { readFrom: ReadFrom.Primary }
    );

    // Assert
    expect(cipher.encryptor({ plainText: Buffer.from("v") }).cipherTextBlob.length).toBeGreaterThan(0);
  });

  test("should refuse a project the replica does not have yet when the caller did not ask for the primary", async () => {
    // Setup
    const built = await started();
    built.state.addProject("project-new", "org-1");
    withLaggingReplica(built, "project-new");

    // Action
    const result = built.kms.createCipherPairWithDataKey({ type: KmsDataKey.SecretManager, projectId: "project-new" });

    // Assert
    await expect(result).rejects.toThrow("Project with ID 'project-new' not found");
  });

  // The key id and the encrypted data key must come from one row: two reads can straddle a key switch.
  test("should read the project row once for a project whose keys exist", async () => {
    // Setup
    const built = await started();
    const first = await built.kms.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId: "project-1"
    });
    const findProject = vi.spyOn(built.dataAccess.scopeKeys, "findProject");

    // Action
    const second = await built.kms.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId: "project-1"
    });

    // Assert
    expect(findProject).toHaveBeenCalledTimes(1);
    const { cipherTextBlob } = first.encryptor({ plainText: Buffer.from("v") });
    expect(second.decryptor({ cipherTextBlob }).toString()).toBe("v");
  });
});

describe("ScopeKeyService.getProjectCertificateKmsKeyId", () => {
  // Concurrent first callers are covered on Postgres, where the compare-and-swap runs against real row locks.
  test("should create the project certificate key on first use and return it afterwards", async () => {
    // Setup
    const { kms, state } = await started();
    const first = await kms.getProjectCertificateKmsKeyId("project-1");

    // Action
    const second = await kms.getProjectCertificateKmsKeyId("project-1");

    // Assert
    expect(second).toBe(first);
    expect(state.tables.kmsKeys.size).toBe(1);
  });
});

describe("ScopeKeyService.deleteProjectKeys", () => {
  test("should refuse a key of another org and keep it", async () => {
    // Setup
    const { kms, state } = await started();
    const keyId = await kms.getProjectCertificateKmsKeyId("project-1");
    state.tables.projects.delete("project-1");

    // Action
    const result = kms.deleteProjectKeys({ orgId: "org-2", kmsKeyIds: [keyId] });

    // Assert
    await expect(result).rejects.toThrow("KMS doesn't belong to organization");
    expect(state.tables.kmsKeys.has(keyId)).toBe(true);
  });

  test("should delete the reserved key once the project is gone", async () => {
    // Setup
    const { kms, state } = await started();
    const keyId = await kms.getProjectCertificateKmsKeyId("project-1");
    state.tables.projects.delete("project-1");

    // Action
    await kms.deleteProjectKeys({ orgId: "org-1", kmsKeyIds: [keyId] });

    // Assert
    expect(state.tables.kmsKeys.has(keyId)).toBe(false);
  });
});
