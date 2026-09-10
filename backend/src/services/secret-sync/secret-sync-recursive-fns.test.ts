import { assertWithinSecretLimit, resolveSyncFolders, SECRET_SYNC_MAX_SECRETS } from "./secret-sync-recursive-fns";

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
