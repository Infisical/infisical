import { SecretFolderRole, TableName, TemporaryPermissionMode } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { KeyStorePrefixes } from "@app/keystore/keystore";
import { ms } from "@app/lib/ms";

const projectId = seedData1.project.id;
const userId = seedData1.id;

const folderAccessUrl = (folderId?: string) =>
  `/api/v1/user-project-additional-privilege/projects/${projectId}/users/${userId}/folder-access${
    folderId ? `/${folderId}` : ""
  }`;

const authHeaders = () => ({ authorization: `Bearer ${jwtAuthToken}` });

const createFolder = async (dto: { path: string; name: string }) => {
  const res = await testServer.inject({
    method: "POST",
    url: `/api/v2/folders`,
    headers: authHeaders(),
    body: {
      projectId,
      environment: seedData1.environment.slug,
      name: dto.name,
      path: dto.path
    }
  });
  expect(res.statusCode).toBe(200);
  return res.json().folder;
};

const deleteFolder = async (dto: { path: string; id: string }) => {
  const res = await testServer.inject({
    method: "DELETE",
    url: `/api/v2/folders/${dto.id}`,
    headers: authHeaders(),
    body: {
      projectId,
      environment: seedData1.environment.slug,
      path: dto.path,
      forceDelete: true
    }
  });
  expect(res.statusCode).toBe(200);
  return res.json().folder;
};

const getFolderPermissionVersion = async () => {
  const row = await testDb(TableName.KeyValueStore)
    .where({ key: KeyStorePrefixes.ProjectFolderPermissionVersion(projectId) })
    .first();
  return Number(row?.integerValue ?? 0);
};

describe("User folder access CRUD", () => {
  let folder: { id: string; name: string };

  beforeAll(async () => {
    folder = await createFolder({ path: "/", name: "user-folder-access" });
  });

  afterAll(async () => {
    await deleteFolder({ path: "/", id: folder.id });
  });

  test("full lifecycle: create, conflict, get, list, patch, delete", async () => {
    const versionBefore = await getFolderPermissionVersion();

    const createRes = await testServer.inject({
      method: "POST",
      url: folderAccessUrl(folder.id),
      headers: authHeaders(),
      body: { permission: SecretFolderRole.Read }
    });
    expect(createRes.statusCode).toBe(200);
    const created = createRes.json().folderAccess;
    expect(created).toEqual(
      expect.objectContaining({
        projectId,
        folderId: folder.id,
        userId,
        permission: SecretFolderRole.Read,
        environment: seedData1.environment.slug,
        secretPath: "/user-folder-access",
        isTemporary: false,
        temporaryRange: null
      })
    );
    expect(created).not.toHaveProperty("name");
    expect(created).not.toHaveProperty("permissions");

    expect(await getFolderPermissionVersion()).toBeGreaterThan(versionBefore);

    const conflictRes = await testServer.inject({
      method: "POST",
      url: folderAccessUrl(folder.id),
      headers: authHeaders(),
      body: { permission: SecretFolderRole.Edit }
    });
    expect(conflictRes.statusCode).toBe(400);
    expect(conflictRes.json().message).toContain("already has folder access");

    const temporaryAccessStartTime = new Date().toISOString();
    const patchRes = await testServer.inject({
      method: "PATCH",
      url: folderAccessUrl(folder.id),
      headers: authHeaders(),
      body: {
        permission: SecretFolderRole.Edit,
        type: {
          isTemporary: true,
          temporaryMode: TemporaryPermissionMode.Relative,
          temporaryRange: "4h",
          temporaryAccessStartTime
        }
      }
    });
    expect(patchRes.statusCode).toBe(200);
    const patched = patchRes.json().folderAccess;
    expect(patched.permission).toBe(SecretFolderRole.Edit);
    expect(patched.isTemporary).toBe(true);
    expect(patched.temporaryMode).toBe(TemporaryPermissionMode.Relative);
    expect(patched.temporaryRange).toBe("4h");
    expect(new Date(patched.temporaryAccessStartTime).toISOString()).toBe(temporaryAccessStartTime);
    expect(
      new Date(patched.temporaryAccessEndTime).getTime() - new Date(patched.temporaryAccessStartTime).getTime()
    ).toBe(ms("4h"));

    const permanentRes = await testServer.inject({
      method: "PATCH",
      url: folderAccessUrl(folder.id),
      headers: authHeaders(),
      body: { type: { isTemporary: false } }
    });
    expect(permanentRes.statusCode).toBe(200);
    const permanent = permanentRes.json().folderAccess;
    expect(permanent.isTemporary).toBe(false);
    expect(permanent.temporaryRange).toBeNull();
    expect(permanent.temporaryAccessStartTime).toBeNull();
    expect(permanent.temporaryAccessEndTime).toBeNull();

    const emptyPatchRes = await testServer.inject({
      method: "PATCH",
      url: folderAccessUrl(folder.id),
      headers: authHeaders(),
      body: {}
    });
    expect(emptyPatchRes.statusCode).toBe(422);

    // the legacy privilege endpoints must not resolve folder grants
    const legacyGetRes = await testServer.inject({
      method: "GET",
      url: `/api/v1/user-project-additional-privilege/${created.id}`,
      headers: authHeaders()
    });
    expect(legacyGetRes.statusCode).toBe(404);

    const deleteRes = await testServer.inject({
      method: "DELETE",
      url: folderAccessUrl(folder.id),
      headers: authHeaders()
    });
    expect(deleteRes.statusCode).toBe(200);
    expect(deleteRes.json().folderAccess.id).toBe(created.id);

    expect(await testDb(TableName.AdditionalPrivilege).where({ id: created.id })).toEqual([]);

    const deleteAgainRes = await testServer.inject({
      method: "DELETE",
      url: folderAccessUrl(folder.id),
      headers: authHeaders()
    });
    expect(deleteAgainRes.statusCode).toBe(404);
  });

  test("rejects a grant on the root folder", async () => {
    const rootFolder = await testDb(TableName.SecretFolder)
      .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
      .where(`${TableName.Environment}.projectId`, projectId)
      .where(`${TableName.Environment}.slug`, seedData1.environment.slug)
      .whereNull(`${TableName.SecretFolder}.parentId`)
      .select(`${TableName.SecretFolder}.id`)
      .first();
    expect(rootFolder).toBeDefined();

    const res = await testServer.inject({
      method: "POST",
      url: folderAccessUrl(rootFolder!.id as string),
      headers: authHeaders(),
      body: { permission: SecretFolderRole.Read }
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain("root folder");
  });

  test("returns 404 for a folder outside the project", async () => {
    const res = await testServer.inject({
      method: "POST",
      url: folderAccessUrl("00000000-0000-0000-0000-000000000000"),
      headers: authHeaders(),
      body: { permission: SecretFolderRole.Read }
    });
    expect(res.statusCode).toBe(404);
  });

  test("returns 404 for a target that is not a project member", async () => {
    const res = await testServer.inject({
      method: "POST",
      url: `/api/v1/user-project-additional-privilege/projects/${projectId}/users/00000000-0000-0000-0000-000000000000/folder-access/${folder.id}`,
      headers: authHeaders(),
      body: { permission: SecretFolderRole.Read }
    });
    expect(res.statusCode).toBe(404);
  });

  test("rejects an unknown role", async () => {
    const res = await testServer.inject({
      method: "POST",
      url: folderAccessUrl(folder.id),
      headers: authHeaders(),
      body: { permission: "owner" }
    });
    expect(res.statusCode).toBe(422);
  });
});
