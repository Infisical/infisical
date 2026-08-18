import { SecretFolderRole, TableName, TemporaryPermissionMode } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { ms } from "@app/lib/ms";

const projectId = seedData1.project.id;
const identityId = seedData1.machineIdentity.id;

const folderAccessUrl = (folderId?: string) =>
  `/api/v2/identity-project-additional-privilege/projects/${projectId}/identities/${identityId}/folder-access${
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

describe("Identity folder access CRUD", () => {
  let folder: { id: string; name: string };

  beforeAll(async () => {
    folder = await createFolder({ path: "/", name: "identity-folder-access" });
  });

  afterAll(async () => {
    await deleteFolder({ path: "/", id: folder.id });
  });

  test("full lifecycle: create, conflict, get, list, patch, delete", async () => {
    const temporaryAccessStartTime = new Date().toISOString();
    const createRes = await testServer.inject({
      method: "POST",
      url: folderAccessUrl(folder.id),
      headers: authHeaders(),
      body: {
        permission: SecretFolderRole.Manage,
        type: {
          isTemporary: true,
          temporaryMode: TemporaryPermissionMode.Relative,
          temporaryRange: "1d",
          temporaryAccessStartTime
        }
      }
    });
    expect(createRes.statusCode).toBe(200);
    const created = createRes.json().folderAccess;
    expect(created).toEqual(
      expect.objectContaining({
        projectId,
        folderId: folder.id,
        identityId,
        permission: SecretFolderRole.Manage,
        environment: seedData1.environment.slug,
        secretPath: "/identity-folder-access",
        isTemporary: true,
        temporaryMode: TemporaryPermissionMode.Relative,
        temporaryRange: "1d"
      })
    );
    expect(new Date(created.temporaryAccessStartTime).toISOString()).toBe(temporaryAccessStartTime);
    expect(new Date(created.temporaryAccessEndTime).getTime() - new Date(created.temporaryAccessStartTime).getTime()).toBe(
      ms("1d")
    );

    const conflictRes = await testServer.inject({
      method: "POST",
      url: folderAccessUrl(folder.id),
      headers: authHeaders(),
      body: { permission: SecretFolderRole.Read }
    });
    expect(conflictRes.statusCode).toBe(400);
    expect(conflictRes.json().message).toContain("already has folder access");

    const patchRes = await testServer.inject({
      method: "PATCH",
      url: folderAccessUrl(folder.id),
      headers: authHeaders(),
      body: { permission: SecretFolderRole.List, type: { isTemporary: false } }
    });
    expect(patchRes.statusCode).toBe(200);
    const patched = patchRes.json().folderAccess;
    expect(patched.permission).toBe(SecretFolderRole.List);
    expect(patched.isTemporary).toBe(false);
    expect(patched.temporaryAccessEndTime).toBeNull();

    const deleteRes = await testServer.inject({
      method: "DELETE",
      url: folderAccessUrl(folder.id),
      headers: authHeaders()
    });
    expect(deleteRes.statusCode).toBe(200);
    expect(deleteRes.json().folderAccess.id).toBe(created.id);

    expect(await testDb(TableName.AdditionalPrivilege).where({ id: created.id })).toEqual([]);
  });
});
