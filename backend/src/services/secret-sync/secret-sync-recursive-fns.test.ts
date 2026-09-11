import {
  assertWithinSecretLimit,
  buildSyncPayload,
  getAncestorPaths,
  mergeImportedSecrets,
  resolveSyncFolders,
  SECRET_SYNC_MAX_SECRETS
} from "./secret-sync-recursive-fns";

const deps = {
  folderDAL: {
    find: async () => [
      { id: "root", name: "root", parentId: null, envId: "env-1", isReserved: false },
      { id: "api", name: "api", parentId: "root", envId: "env-1", isReserved: false }
    ]
  },
  projectEnvDAL: { findOne: async () => ({ id: "env-1", slug: "dev", projectId: "proj-1" }) }
} as unknown as Pick<Parameters<typeof resolveSyncFolders>[0], "folderDAL" | "projectEnvDAL">;

describe("resolveSyncFolders", () => {
  test("returns only the source folder when recursive is off", async () => {
    const folders = await resolveSyncFolders({
      ...deps,
      projectId: "proj-1",
      environment: "dev",
      sourcePath: "/",
      sourceFolderId: "root",
      recursive: false
    });

    expect(folders).toEqual([{ folderId: "root", path: "/" }]);
  });

  test("returns the source folder and its descendants when recursive is on", async () => {
    const folders = await resolveSyncFolders({
      ...deps,
      projectId: "proj-1",
      environment: "dev",
      sourcePath: "/",
      sourceFolderId: "root",
      recursive: true
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

describe("assertWithinSecretLimit", () => {
  test("accepts a count at the limit", () => {
    expect(() => assertWithinSecretLimit(SECRET_SYNC_MAX_SECRETS)).not.toThrow();
  });

  test("rejects a count above the limit with a message naming both numbers", () => {
    expect(() => assertWithinSecretLimit(SECRET_SYNC_MAX_SECRETS + 1)).toThrow(
      new RegExp(`${SECRET_SYNC_MAX_SECRETS + 1}.*${SECRET_SYNC_MAX_SECRETS}`)
    );
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

  test("a later import wins over an earlier one in the same folder, as today", () => {
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
        licenseService: { getPlan: async () => ({ crossProjectSecretSharing: false }) },
        kmsService: {
          createCipherPairWithDataKey: async () => ({
            decryptor: () => "",
            encryptor: () => ({ cipherTextBlob: Buffer.from("") })
          })
        }
      }
    } as unknown as Parameters<typeof buildSyncPayload>[0];

    const payload = await buildSyncPayload(buildDeps, {
      projectId: "proj-1",
      environment: "dev",
      sourcePath: "/",
      sourceFolderId: "root",
      recursive: true,
      includeImports: true
    });

    const paths = payload
      .all()
      .map((entry) => entry.path)
      .sort();

    expect(paths).toEqual(["/", "/api"]);
  });
});

describe("buildSyncPayload dedupeForRemoval", () => {
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
      licenseService: { getPlan: async () => ({ crossProjectSecretSharing: false }) },
      kmsService: {
        createCipherPairWithDataKey: async () => ({
          decryptor: () => "",
          encryptor: () => ({ cipherTextBlob: Buffer.from("") })
        })
      }
    }
  } as unknown as Parameters<typeof buildSyncPayload>[0];

  const args = {
    projectId: "proj-1",
    environment: "dev",
    sourcePath: "/",
    sourceFolderId: "root",
    recursive: true,
    includeImports: true
  };

  // Pins the sync-path requirement from the same bug: a name used in two folders must still
  // fail loudly on this path, since only the remove path may look past it.
  test("a cross-folder duplicate name still throws when dedupeForRemoval is not set", async () => {
    const payload = await buildSyncPayload(dedupeDeps, args);

    expect(() => payload.flatten()).toThrow(/DB_URL/);
  });

  // A sync whose secrets collide across folders would otherwise be stuck: it fails to sync,
  // and until this test, it also failed to remove, which is the only way to delete it.
  test("dedupeForRemoval lets the remove path complete despite the same duplicate", async () => {
    const payload = await buildSyncPayload(dedupeDeps, { ...args, dedupeForRemoval: true });

    expect(() => payload.flatten()).not.toThrow();
    expect(Object.keys(payload.flatten())).toEqual(["DB_URL"]);
  });
});
