import { ActionProjectType, SecretFolderRole, TableName } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { groupDALFactory } from "@app/ee/services/group/group-dal";
import { permissionDALFactory } from "@app/ee/services/permission/permission-dal";
import { permissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { keyValueStoreDALFactory } from "@app/keystore/key-value-store-dal";
import { keyStoreFactory, KeyStorePrefixes } from "@app/keystore/keystore";
import { getConfig, initEnvConfig } from "@app/lib/config/env";
import { initLogger, logger } from "@app/lib/logger";
import { additionalPrivilegeDALFactory } from "@app/services/additional-privilege/additional-privilege-dal";
import { ActorType, AuthMethod } from "@app/services/auth/auth-type";
import { identityDALFactory } from "@app/services/identity/identity-dal";
import { projectDALFactory } from "@app/services/project/project-dal";
import { roleDALFactory } from "@app/services/role/role-dal";
import { secretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";
import { serviceTokenDALFactory } from "@app/services/service-token/service-token-dal";
import { userDALFactory } from "@app/services/user/user-dal";

const projectId = seedData1.project.id;
const userId = seedData1.id;

const permissionArg = {
  actor: ActorType.USER,
  actorId: userId,
  projectId,
  actorAuthMethod: AuthMethod.EMAIL,
  actorOrgId: seedData1.organization.id,
  actionProjectType: ActionProjectType.SecretManager
};

// the `services` decoration is encapsulated inside the routes plugin, so build the
// permission service directly against the same DB/Redis the test server runs on
let permissionService: TPermissionServiceFactory;

beforeAll(async () => {
  initLogger();
  await initEnvConfig(testHsmService, testKmsRootConfigDAL, testSuperAdminDAL, logger);
  const keyStore = keyStoreFactory(getConfig(), keyValueStoreDALFactory(testDb));

  permissionService = permissionServiceFactory({
    permissionDAL: permissionDALFactory(testDb),
    serviceTokenDAL: serviceTokenDALFactory(testDb),
    projectDAL: projectDALFactory(testDb),
    userDAL: userDALFactory(testDb),
    identityDAL: identityDALFactory(testDb),
    keyStore,
    roleDAL: roleDALFactory(testDb),
    additionalPrivilegeDAL: additionalPrivilegeDALFactory(testDb),
    groupDAL: groupDALFactory(testDb),
    secretFolderDAL: secretFolderDALFactory(testDb)
  });
});

const permissionDataKey = KeyStorePrefixes.ProjectPermissionData(
  projectId,
  ActorType.USER,
  userId,
  ActionProjectType.SecretManager
);
const permissionMarkerKey = KeyStorePrefixes.ProjectPermissionMarker(
  projectId,
  ActorType.USER,
  userId,
  ActionProjectType.SecretManager
);
const folderDataKey = KeyStorePrefixes.ProjectFolderPermissionData(projectId, ActorType.USER, userId);
const folderMarkerKey = KeyStorePrefixes.ProjectFolderPermissionMarker(projectId, ActorType.USER, userId);
const folderVersionKey = KeyStorePrefixes.ProjectFolderPermissionVersion(projectId);

const createFolder = async (dto: { path: string; name: string }) => {
  const res = await testServer.inject({
    method: "POST",
    url: `/api/v2/folders`,
    headers: {
      authorization: `Bearer ${jwtAuthToken}`
    },
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

const deleteFolder = async (dto: { path: string; id: string; forceDelete?: boolean }) => {
  const res = await testServer.inject({
    method: "DELETE",
    url: `/api/v2/folders/${dto.id}`,
    headers: {
      authorization: `Bearer ${jwtAuthToken}`
    },
    body: {
      projectId,
      environment: seedData1.environment.slug,
      path: dto.path,
      forceDelete: dto.forceDelete ?? false
    }
  });
  expect(res.statusCode).toBe(200);
  return res.json().folder;
};

const moveFolder = async (dto: { folderId: string; destinationPath: string }) => {
  const res = await testServer.inject({
    method: "POST",
    url: `/api/v2/folders/move`,
    headers: {
      authorization: `Bearer ${jwtAuthToken}`
    },
    body: {
      projectId,
      folderId: dto.folderId,
      destinationEnvironment: seedData1.environment.slug,
      destinationPath: dto.destinationPath
    }
  });
  expect(res.statusCode).toBe(200);
  return res.json();
};

const getFolderVersion = async () => {
  const row = await testDb(TableName.KeyValueStore).where({ key: folderVersionKey }).first();
  return Number(row?.integerValue ?? 0);
};

describe("Folder-scoped privilege permissions", () => {
  test("folder permission cache outlives the project permission cache", async () => {
    await testRedis.del(permissionDataKey, permissionMarkerKey, folderDataKey, folderMarkerKey);

    await permissionService.getProjectPermission(permissionArg);

    const [permissionDataTtl, permissionMarkerTtl, folderDataTtl, folderMarkerTtl] = await Promise.all([
      testRedis.ttl(permissionDataKey),
      testRedis.ttl(permissionMarkerKey),
      testRedis.ttl(folderDataKey),
      testRedis.ttl(folderMarkerKey)
    ]);

    expect(permissionDataTtl).toBeGreaterThan(540);
    expect(permissionDataTtl).toBeLessThanOrEqual(600);
    expect(permissionMarkerTtl).toBeGreaterThan(0);
    expect(permissionMarkerTtl).toBeLessThanOrEqual(10);

    expect(folderDataTtl).toBeGreaterThan(840);
    expect(folderDataTtl).toBeLessThanOrEqual(900);
    expect(folderMarkerTtl).toBeGreaterThan(10);
    expect(folderMarkerTtl).toBeLessThanOrEqual(15);

    expect(folderDataTtl).toBeGreaterThan(permissionDataTtl);
    expect(folderMarkerTtl).toBeGreaterThan(permissionMarkerTtl);
  });

  test("computes the folder path, survives a folder move, and refetches on version bump", async () => {
    const folderA = await createFolder({ path: "/", name: "rbac-a" });
    const folderB = await createFolder({ path: "/rbac-a", name: "rbac-b" });
    const folderDest = await createFolder({ path: "/", name: "rbac-dest" });

    await testDb(TableName.AdditionalPrivilege).insert({
      name: "e2e-folder-rbac",
      actorUserId: userId,
      projectId,
      folderId: folderB.id,
      role: SecretFolderRole.Read,
      permissions: null,
      isTemporary: false
    });

    // the raw insert bypasses the version bump, so force a cold fetch
    await testRedis.del(folderDataKey, folderMarkerKey);
    const before = await permissionService.getProjectPermission(permissionArg);
    expect(before.folderScopedPrivileges).toEqual([
      expect.objectContaining({
        folderId: folderB.id,
        role: SecretFolderRole.Read,
        environmentSlug: seedData1.environment.slug,
        secretPath: "/rbac-a/rbac-b"
      })
    ]);

    const versionBefore = await getFolderVersion();

    await moveFolder({ folderId: folderA.id, destinationPath: "/rbac-dest" });

    const [privilegeRow] = await testDb(TableName.AdditionalPrivilege).where({ name: "e2e-folder-rbac" });
    expect(privilegeRow).toBeDefined();
    expect(privilegeRow.folderId).not.toBe(folderB.id);

    const versionAfter = await getFolderVersion();
    expect(versionAfter).toBeGreaterThan(versionBefore);

    // simulate marker expiry only: the stale data blob with the pre-move fingerprint stays,
    // so the refetch below is driven by the version bump, not by a cold cache
    await testRedis.del(folderMarkerKey);
    const after = await permissionService.getProjectPermission(permissionArg);
    expect(after.folderScopedPrivileges).toEqual([
      expect.objectContaining({
        folderId: privilegeRow.folderId,
        role: SecretFolderRole.Read,
        environmentSlug: seedData1.environment.slug,
        secretPath: "/rbac-dest/rbac-a/rbac-b"
      })
    ]);

    await deleteFolder({ path: "/", id: folderDest.id, forceDelete: true });
    expect(await testDb(TableName.AdditionalPrivilege).where({ name: "e2e-folder-rbac" })).toEqual([]);
  });
});
