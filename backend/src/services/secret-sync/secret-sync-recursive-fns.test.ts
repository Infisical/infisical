import {
  buildSyncPayload,
  getSyncedFolders,
  isPathCoveredBySecretSync,
  isPathOrDescendantCoveredBySecretSync,
  mergeImportedSecrets,
  toSyncsNewlyCoveringPath
} from "./secret-sync-recursive-fns";

const deps = {
  folderDAL: {
    find: async () => [
      { id: "root", name: "root", parentId: null, envId: "env-1", isReserved: false },
      { id: "api", name: "api", parentId: "root", envId: "env-1", isReserved: false }
    ]
  },
  projectEnvDAL: { findOne: async () => ({ id: "env-1", slug: "dev", projectId: "proj-1" }) }
} as unknown as Pick<Parameters<typeof getSyncedFolders>[0], "folderDAL" | "projectEnvDAL">;

describe("getSyncedFolders", () => {
  test("returns only the source folder when subfolders are off", async () => {
    const folders = await getSyncedFolders({
      ...deps,
      projectId: "proj-1",
      environment: "dev",
      sourcePath: "/",
      sourceFolderId: "root",
      includeAllSubFolders: false
    });

    expect(folders).toEqual([{ folderId: "root", path: "/" }]);
  });

  test("returns the source folder and its descendants when subfolders are on", async () => {
    const folders = await getSyncedFolders({
      ...deps,
      projectId: "proj-1",
      environment: "dev",
      sourcePath: "/",
      sourceFolderId: "root",
      includeAllSubFolders: true
    });

    expect(folders.map((folder) => folder.path).sort()).toEqual(["/", "/api"]);
  });
});

describe("isPathCoveredBySecretSync", () => {
  const sync = (path: string, includeAllSubFolders?: boolean, envId = "env-1") => ({
    environment: { id: envId },
    folder: { path },
    syncOptions: includeAllSubFolders === undefined ? {} : { includeAllSubFolders }
  });

  const covers = (entry: ReturnType<typeof sync>, secretPath: string, envId = "env-1") =>
    isPathCoveredBySecretSync(entry, { envId, secretPath });

  test("covers its own path whether or not it includes subfolders", () => {
    expect(covers(sync("/apps", false), "/apps")).toBe(true);
    expect(covers(sync("/apps", true), "/apps")).toBe(true);
    expect(covers(sync("/apps"), "/apps")).toBe(true);
  });

  test("covers a descendant path only when it includes subfolders", () => {
    expect(covers(sync("/apps", true), "/apps/payments/new")).toBe(true);
    expect(covers(sync("/apps", false), "/apps/payments")).toBe(false);
    expect(covers(sync("/apps"), "/apps/payments")).toBe(false);
  });

  test("covers everything from the root when it includes subfolders", () => {
    expect(covers(sync("/", true), "/apps/payments")).toBe(true);
    expect(covers(sync("/", false), "/apps")).toBe(false);
    expect(covers(sync("/", false), "/")).toBe(true);
  });

  test("never covers an ancestor or a sibling sharing a name prefix", () => {
    expect(covers(sync("/apps/payments", true), "/apps")).toBe(false);
    expect(covers(sync("/apps", true), "/apps-legacy")).toBe(false);
  });

  test("never covers a path in another environment", () => {
    expect(covers(sync("/apps", true, "env-2"), "/apps")).toBe(false);
  });

  test("never covers anything without a folder", () => {
    expect(
      isPathCoveredBySecretSync({ environment: { id: "env-1" }, folder: null }, { envId: "env-1", secretPath: "/" })
    ).toBe(false);
  });

  test("treats trailing and repeated slashes as the same path", () => {
    expect(covers(sync("/apps"), "/apps/")).toBe(true);
    expect(covers(sync("/apps/payments"), "/apps//payments")).toBe(true);
  });
});

describe("isPathOrDescendantCoveredBySecretSync", () => {
  const sync = (path: string, includeAllSubFolders = false, envId = "env-1") => ({
    environment: { id: envId },
    folder: { path },
    syncOptions: { includeAllSubFolders }
  });

  const covers = (entry: ReturnType<typeof sync>, secretPath: string, envId = "env-1") =>
    isPathOrDescendantCoveredBySecretSync(entry, { envId, secretPath });

  test("covers whatever the path itself is covered by", () => {
    expect(covers(sync("/apps"), "/apps")).toBe(true);
    expect(covers(sync("/", true), "/apps")).toBe(true);
  });

  test("covers a sync rooted anywhere beneath the path, recursive or not", () => {
    expect(covers(sync("/apps/payments"), "/apps")).toBe(true);
    expect(covers(sync("/apps/payments/api", true), "/apps")).toBe(true);
    expect(covers(sync("/apps"), "/")).toBe(true);
  });

  test("never covers a non-recursive ancestor, a sibling, or another environment", () => {
    expect(covers(sync("/"), "/apps")).toBe(false);
    expect(covers(sync("/apps-legacy/api"), "/apps")).toBe(false);
    expect(covers(sync("/apps/payments", false, "env-2"), "/apps")).toBe(false);
  });
});

describe("toSyncsNewlyCoveringPath", () => {
  const sync = (id: string, overrides: Record<string, unknown> = {}) => ({
    id,
    name: id,
    destination: "aws-parameter-store",
    folder: { path: "/apps" },
    syncOptions: { includeAllSubFolders: true },
    isAutoSyncEnabled: true,
    ...overrides
  });

  const canReadAll = () => true;

  test("leaves out a sync that already covers the source", () => {
    const result = toSyncsNewlyCoveringPath({
      sourceSyncs: [sync("shared")],
      destinationSyncs: [sync("shared"), sync("new")],
      canRead: canReadAll
    });

    expect(result.secretSyncs.map((entry) => entry.id)).toEqual(["new"]);
  });

  test("returns nothing when the destination is covered only by the source's syncs", () => {
    expect(
      toSyncsNewlyCoveringPath({ sourceSyncs: [sync("a")], destinationSyncs: [sync("a")], canRead: canReadAll })
    ).toEqual({ secretSyncs: [], hasHiddenSecretSyncs: false });
  });

  test("orders syncs by name", () => {
    const result = toSyncsNewlyCoveringPath({
      sourceSyncs: [],
      destinationSyncs: [sync("b", { name: "zeta" }), sync("a", { name: "alpha" })],
      canRead: canReadAll
    });

    expect(result.secretSyncs.map((entry) => entry.name)).toEqual(["alpha", "zeta"]);
  });

  test("returns the details of a sync the actor can read", () => {
    const { secretSyncs } = toSyncsNewlyCoveringPath({
      sourceSyncs: [],
      destinationSyncs: [sync("a", { folder: { path: "/flat" }, syncOptions: {}, isAutoSyncEnabled: false })],
      canRead: canReadAll
    });

    expect(secretSyncs).toEqual([
      {
        id: "a",
        name: "a",
        destination: "aws-parameter-store",
        secretPath: "/flat",
        includeAllSubFolders: false,
        isAutoSyncEnabled: false
      }
    ]);
  });

  test("reports syncs the actor cannot read only as a flag, however many there are", () => {
    const result = toSyncsNewlyCoveringPath({
      sourceSyncs: [],
      destinationSyncs: [sync("visible"), sync("hidden-1"), sync("hidden-2")],
      canRead: (entry) => entry.id === "visible"
    });

    expect(result.secretSyncs.map((entry) => entry.id)).toEqual(["visible"]);
    expect(result.hasHiddenSecretSyncs).toBe(true);
  });

  test("does not flag a hidden sync that already covers the source", () => {
    const result = toSyncsNewlyCoveringPath({
      sourceSyncs: [sync("hidden")],
      destinationSyncs: [sync("hidden")],
      canRead: () => false
    });

    expect(result.hasHiddenSecretSyncs).toBe(false);
  });
});

describe("mergeImportedSecrets", () => {
  const imported = (key: string, secretValue: string) => ({ key, secretValue }) as never;

  test("a folder's own secret beats one it imported", () => {
    const merged = mergeImportedSecrets(
      [{ key: "DB_URL", path: "/backend", value: "local" }],
      [{ path: "/backend", secrets: [imported("DB_URL", "remote")] }]
    );

    expect(merged).toHaveLength(1);
    expect(merged[0].value).toBe("local");
  });

  test("the same name imported into two folders yields two entries", () => {
    const merged = mergeImportedSecrets(
      [],
      [
        { path: "/backend", secrets: [imported("DB_URL", "one")] },
        { path: "/backend/api", secrets: [imported("DB_URL", "two")] }
      ]
    );

    expect(merged.map((entry) => entry.path).sort()).toEqual(["/backend", "/backend/api"]);
  });

  // Two import statements in the same folder resolving the same key is pre-existing, released
  // behavior: the reverse loop this reuses already shipped in secret-v2-bridge-service.ts. This
  // pins that behavior so mergeImportedSecrets doesn't change it, not because it's the right
  // design. Ideally a same-folder import collision would be a conflict error, the same way a
  // duplicate name across folders already is.
  //
  // "Later" means higher position: secretImportDAL.findByFolderIds orders imports by position
  // ascending, and that order survives unchanged through fnSecretsV2FromImports, so the import
  // listed lower in that folder's import list is what wins.
  test("the import listed later (by position) wins over an earlier one in the same folder", () => {
    const merged = mergeImportedSecrets(
      [],
      [
        { path: "/backend", secrets: [imported("DB_URL", "first")] },
        { path: "/backend", secrets: [imported("DB_URL", "second")] }
      ]
    );

    expect(merged).toHaveLength(1);
    expect(merged[0].value).toBe("second");
  });
});

describe("buildSyncPayload", () => {
  test("two folders importing the same source both receive its secrets", async () => {
    const sharedSecret = {
      id: "secret-1",
      key: "DB_URL",
      folderId: "shared-folder",
      encryptedValue: Buffer.from("shared-value"),
      encryptedComment: null,
      skipMultilineEncoding: false,
      tags: [],
      secretMetadata: []
    };

    const rootImport = {
      id: "import-root",
      folderId: "root",
      importPath: "/shared",
      importEnv: { id: "env-1", slug: "dev", name: "dev", projectId: "proj-1" },
      isReplication: false,
      isReserved: false,
      position: 1
    };

    const apiImport = {
      id: "import-api",
      folderId: "api",
      importPath: "/shared",
      importEnv: { id: "env-1", slug: "dev", name: "dev", projectId: "proj-1" },
      isReplication: false,
      isReserved: false,
      position: 1
    };

    const buildDeps = {
      folderDAL: {
        find: async () => [
          { id: "root", name: "root", parentId: null, envId: "env-1", isReserved: false },
          { id: "api", name: "api", parentId: "root", envId: "env-1", isReserved: false }
        ],
        findByManySecretPath: async (query: { envId: string; secretPath: string }[]) =>
          query.map(() => ({
            id: "shared-folder",
            envId: "env-1",
            path: "/shared",
            name: "shared",
            parentId: null,
            isReserved: false
          }))
      },
      projectEnvDAL: { findOne: async () => ({ id: "env-1", slug: "dev", projectId: "proj-1" }) },
      secretV2BridgeDAL: {
        findByFolderIds: async () => [],
        find: async () => [sharedSecret]
      },
      secretImportDAL: {
        findByFolderIds: async (folderIds: string[]) =>
          [rootImport, apiImport].filter((row) => folderIds.includes(row.folderId)),
        findByIds: async () => []
      },
      expandSecretReferences: async ({ value }: { value?: string }) => value,
      decryptSecretValue: (value?: Buffer | null) => (value ? value.toString() : ""),
      fnSecretsV2FromImportsDeps: {
        projectFolderGrantDAL: { find: async () => [] },
        actorOrgId: "org-1",
        orgDAL: { findOrgById: async () => ({ allowCrossProjectSecretSharing: false }) },
        kmsService: {
          createCipherPairWithDataKey: async () => ({
            decryptor: () => "",
            encryptor: () => ({ cipherTextBlob: Buffer.from("") })
          })
        }
      }
    } as unknown as Parameters<typeof buildSyncPayload>[1];

    const payload = await buildSyncPayload(
      {
        projectId: "proj-1",
        environment: "dev",
        sourcePath: "/",
        sourceFolderId: "root",
        syncOptions: { includeAllSubFolders: true },
        includeImports: true
      },
      buildDeps
    );

    const paths = payload.secrets.map((entry) => entry.path).sort();

    expect(paths).toEqual(["/", "/api"]);
  });
});

describe("buildSyncPayload cross-folder duplicates", () => {
  const duplicateNameSecret = (folderId: string, value: string) => ({
    id: `secret-${folderId}`,
    key: "DB_URL",
    folderId,
    encryptedValue: Buffer.from(value),
    encryptedComment: null,
    skipMultilineEncoding: false,
    tags: [],
    secretMetadata: []
  });

  const dedupeDeps = {
    folderDAL: {
      find: async () => [
        { id: "root", name: "root", parentId: null, envId: "env-1", isReserved: false },
        { id: "api", name: "api", parentId: "root", envId: "env-1", isReserved: false }
      ]
    },
    projectEnvDAL: { findOne: async () => ({ id: "env-1", slug: "dev", projectId: "proj-1" }) },
    secretV2BridgeDAL: {
      findByFolderIds: async () => [duplicateNameSecret("root", "root-value"), duplicateNameSecret("api", "api-value")]
    },
    secretImportDAL: {
      findByFolderIds: async () => [],
      findByIds: async () => []
    },
    expandSecretReferences: async ({ value }: { value?: string }) => value,
    decryptSecretValue: (value?: Buffer | null) => (value ? value.toString() : ""),
    fnSecretsV2FromImportsDeps: {
      projectFolderGrantDAL: { find: async () => [] },
      actorOrgId: "org-1",
      orgDAL: { findOrgById: async () => ({ allowCrossProjectSecretSharing: false }) },
      kmsService: {
        createCipherPairWithDataKey: async () => ({
          decryptor: () => "",
          encryptor: () => ({ cipherTextBlob: Buffer.from("") })
        })
      }
    }
  } as unknown as Parameters<typeof buildSyncPayload>[1];

  const args = {
    projectId: "proj-1",
    environment: "dev",
    sourcePath: "/",
    sourceFolderId: "root",
    syncOptions: { includeAllSubFolders: true },
    includeImports: true
  } as Parameters<typeof buildSyncPayload>[0];

  // Pins the sync-path requirement from the same bug: a name used in two folders must still fail
  // loudly on this path, since only the remove path may look past it.
  test("a cross-folder duplicate name still throws by default", async () => {
    const payload = await buildSyncPayload(args, dedupeDeps);

    expect(() => payload.flatten()).toThrow(/DB_URL/);
  });

  // A sync whose secrets collide across folders would otherwise be stuck: it fails to sync, and
  // until dedupeConflicts() existed, it also failed to remove, which is the only way to delete it.
  test("dedupeConflicts() lets the remove path complete despite the same duplicate", async () => {
    const payload = await buildSyncPayload(args, dedupeDeps);
    const deduped = payload.dedupeConflicts();

    expect(() => deduped.flatten()).not.toThrow();
    expect(Object.keys(deduped.flatten())).toEqual(["DB_URL"]);
  });
});
