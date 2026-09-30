import {
  buildSyncPayload,
  findSecretSyncsCoveringPath,
  getAncestorPaths,
  getSyncedFolders,
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

describe("getAncestorPaths", () => {
  test("returns the root for a top-level path", () => {
    expect(getAncestorPaths("/")).toEqual([]);
  });

  test("returns every ancestor, closest last", () => {
    expect(getAncestorPaths("/backend/api/v2")).toEqual(["/", "/backend", "/backend/api"]);
  });

  test("never includes the path itself", () => {
    for (const path of ["/", "/backend", "/backend/api", "/backend/api/v2"]) {
      expect(getAncestorPaths(path)).not.toContain(path);
    }
  });

  test("returns one fewer entry than the path has segments", () => {
    expect(getAncestorPaths("/a")).toHaveLength(1);
    expect(getAncestorPaths("/a/b")).toHaveLength(2);
    expect(getAncestorPaths("/a/b/c")).toHaveLength(3);
    expect(getAncestorPaths("/a/b/c/d")).toHaveLength(4);
  });

  test("treats a trailing slash as the same path", () => {
    expect(getAncestorPaths("/backend/api/")).toEqual(getAncestorPaths("/backend/api"));
  });

  test("tolerates repeated separators", () => {
    expect(getAncestorPaths("/backend//api")).toEqual(getAncestorPaths("/backend/api"));
  });

  test("returns an empty list for inputs that name no folder", () => {
    // The queue passes whatever path the write carried. An empty result must mean
    // "no ancestors to consider", never a lookup for a folder that cannot exist.
    expect(getAncestorPaths("")).toEqual([]);
    expect(getAncestorPaths("//")).toEqual([]);
  });

  test("every returned path is absolute and free of a trailing slash", () => {
    for (const ancestor of getAncestorPaths("/a/b/c/d")) {
      expect(ancestor.startsWith("/")).toBe(true);
      if (ancestor !== "/") expect(ancestor.endsWith("/")).toBe(false);
    }
  });

  test("returns the root exactly once, and only as the first entry", () => {
    const ancestors = getAncestorPaths("/a/b/c");
    expect(ancestors.filter((entry) => entry === "/")).toHaveLength(1);
    expect(ancestors[0]).toBe("/");
  });

  test("returns the root for a single-segment path", () => {
    expect(getAncestorPaths("/backend")).toEqual(["/"]);
  });
});

describe("findSecretSyncsCoveringPath", () => {
  const folderIdByPath: Record<string, string> = {
    "/": "root",
    "/apps": "apps",
    "/apps/payments": "payments"
  };

  const syncs = [
    { id: "root-flat", folderId: "root", syncOptions: { includeAllSubFolders: false } },
    { id: "apps-recursive", folderId: "apps", syncOptions: { includeAllSubFolders: true } },
    { id: "payments-flat", folderId: "payments", syncOptions: {} }
  ];

  const toFolder = (path: string) => (folderIdByPath[path] ? { id: folderIdByPath[path], path } : undefined);

  const coveringDeps = {
    folderDAL: {
      findBySecretPath: async (_projectId: string, _environment: string, path: string) => toFolder(path),
      findByManySecretPath: async (queries: { secretPath: string }[]) =>
        queries.map(({ secretPath }) => toFolder(secretPath))
    },
    secretSyncDAL: {
      find: vi.fn(async ({ $in }: { $in: { folderId: string[] } }) =>
        syncs.filter((sync) => $in.folderId.includes(sync.folderId))
      )
    }
  } as unknown as Parameters<typeof findSecretSyncsCoveringPath>[1];

  const coveringIds = async (secretPath: string) =>
    (
      await findSecretSyncsCoveringPath(
        { projectId: "proj-1", environment: { id: "env-1", slug: "dev" }, secretPath },
        coveringDeps
      )
    )
      .map((sync) => sync.id)
      .sort();

  test("matches a sync on the path itself whether or not it includes subfolders", async () => {
    expect(await coveringIds("/apps/payments")).toEqual(["apps-recursive", "payments-flat"]);
  });

  test("matches a sync on an ancestor only when it includes subfolders", async () => {
    expect(await coveringIds("/apps")).toEqual(["apps-recursive"]);
  });

  test("matches ancestors of a path that does not exist yet", async () => {
    // A folder being moved lands at a path that has no folder until the move runs.
    expect(await coveringIds("/apps/payments/new")).toEqual(["apps-recursive"]);
  });

  test("matches the root sync for the root path", async () => {
    expect(await coveringIds("/")).toEqual(["root-flat"]);
  });

  test("returns nothing without querying syncs when no folder on the path exists", async () => {
    const find = vi.mocked(coveringDeps.secretSyncDAL.find);
    find.mockClear();

    const result = await findSecretSyncsCoveringPath(
      { projectId: "proj-1", environment: { id: "env-2", slug: "prod" }, secretPath: "/missing" },
      {
        ...coveringDeps,
        folderDAL: {
          findBySecretPath: async () => undefined,
          findByManySecretPath: async (queries: unknown[]) => queries.map(() => undefined)
        } as unknown as Parameters<typeof findSecretSyncsCoveringPath>[1]["folderDAL"]
      }
    );

    expect(result).toEqual([]);
    expect(find).not.toHaveBeenCalled();
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

    expect(result.map((entry) => entry.id)).toEqual(["new"]);
  });

  test("returns nothing when the destination is covered only by the source's syncs", () => {
    expect(
      toSyncsNewlyCoveringPath({ sourceSyncs: [sync("a")], destinationSyncs: [sync("a")], canRead: canReadAll })
    ).toEqual([]);
  });

  test("orders syncs by name", () => {
    const result = toSyncsNewlyCoveringPath({
      sourceSyncs: [],
      destinationSyncs: [sync("b", { name: "zeta" }), sync("a", { name: "alpha" })],
      canRead: canReadAll
    });

    expect(result.map((entry) => entry.name)).toEqual(["alpha", "zeta"]);
  });

  test("returns the details of a sync the actor can read", () => {
    const [entry] = toSyncsNewlyCoveringPath({
      sourceSyncs: [],
      destinationSyncs: [sync("a", { folder: { path: "/flat" }, syncOptions: {}, isAutoSyncEnabled: false })],
      canRead: canReadAll
    });

    expect(entry).toEqual({
      id: "a",
      name: "a",
      destination: "aws-parameter-store",
      secretPath: "/flat",
      includeAllSubFolders: false,
      isAutoSyncEnabled: false
    });
  });

  test("withholds every detail of a sync the actor cannot read, but still reports it", () => {
    const result = toSyncsNewlyCoveringPath({
      sourceSyncs: [],
      destinationSyncs: [sync("visible"), sync("hidden")],
      canRead: (entry) => entry.id !== "hidden"
    });

    expect(result).toHaveLength(2);
    expect(result.find((entry) => entry.id === null)).toEqual({
      id: null,
      name: null,
      destination: null,
      secretPath: null,
      includeAllSubFolders: null,
      isAutoSyncEnabled: null
    });
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
