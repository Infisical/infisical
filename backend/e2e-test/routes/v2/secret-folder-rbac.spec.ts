import { subject } from "@casl/ability";

import {
  AccessScope,
  ActionProjectType,
  OrgMembershipRole,
  OrgMembershipStatus,
  ProjectMembershipRole,
  SecretFolderRole,
  TableName
} from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { groupDALFactory } from "@app/ee/services/group/group-dal";
import { permissionDALFactory } from "@app/ee/services/permission/permission-dal";
import { permissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionSecretActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { keyValueStoreDALFactory } from "@app/keystore/key-value-store-dal";
import { keyStoreFactory, KeyStorePrefixes } from "@app/keystore/keystore";
import { getConfig, initEnvConfig } from "@app/lib/config/env";
import { initLogger, logger } from "@app/lib/logger";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { additionalPrivilegeDALFactory } from "@app/services/additional-privilege/additional-privilege-dal";
import { ActorType, AuthMethod } from "@app/services/auth/auth-type";
import { identityDALFactory } from "@app/services/identity/identity-dal";
import { projectDALFactory } from "@app/services/project/project-dal";
import { roleDALFactory } from "@app/services/role/role-dal";
import { secretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";
import { serviceTokenDALFactory } from "@app/services/service-token/service-token-dal";
import { userDALFactory } from "@app/services/user/user-dal";

const projectId = seedData1.project.id;
const orgId = seedData1.organization.id;

// the seed user is the project admin, and getProjectPermission skips folder grants for admins, so
// permission evaluation runs against a dedicated member user created in beforeAll
let memberUserId: string;
let memberMembershipId: string;

let permissionArg: {
  actor: ActorType;
  actorId: string;
  projectId: string;
  actorAuthMethod: AuthMethod;
  actorOrgId: string;
  actionProjectType: ActionProjectType;
};

// the `services` decoration is encapsulated inside the routes plugin, so build the
// permission service directly against the same DB/Redis the test server runs on
let permissionService: TPermissionServiceFactory;

let permissionDataKey: string;
let permissionMarkerKey: string;
let folderDataKey: string;
let folderMarkerKey: string;
const folderVersionKey = KeyStorePrefixes.ProjectFolderPermissionVersion(projectId);

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

  const username = `folder-rbac-${alphaNumericNanoId(8)}@example.com`.toLowerCase();
  const [user] = await testDb(TableName.Users)
    .insert({ username, email: username, isGhost: false, isAccepted: true, authMethods: [AuthMethod.EMAIL] })
    .returning("*");
  memberUserId = user.id;

  const [orgMembership] = await testDb(TableName.Membership)
    .insert({
      scope: AccessScope.Organization,
      scopeOrgId: orgId,
      actorUserId: memberUserId,
      status: OrgMembershipStatus.Accepted,
      isActive: true
    })
    .returning("*");
  await testDb(TableName.MembershipRole).insert({ membershipId: orgMembership.id, role: OrgMembershipRole.Member });

  const [projectMembership] = await testDb(TableName.Membership)
    .insert({
      scope: AccessScope.Project,
      scopeOrgId: orgId,
      scopeProjectId: projectId,
      actorUserId: memberUserId
    })
    .returning("*");
  memberMembershipId = projectMembership.id;
  await testDb(TableName.MembershipRole).insert({
    membershipId: memberMembershipId,
    role: ProjectMembershipRole.Member
  });

  permissionArg = {
    actor: ActorType.USER,
    actorId: memberUserId,
    projectId,
    actorAuthMethod: AuthMethod.EMAIL,
    actorOrgId: orgId,
    actionProjectType: ActionProjectType.SecretManager
  };

  permissionDataKey = KeyStorePrefixes.ProjectPermissionData(
    projectId,
    ActorType.USER,
    memberUserId,
    ActionProjectType.SecretManager
  );
  permissionMarkerKey = KeyStorePrefixes.ProjectPermissionMarker(
    projectId,
    ActorType.USER,
    memberUserId,
    ActionProjectType.SecretManager
  );
  folderDataKey = KeyStorePrefixes.ProjectFolderPermissionData(projectId, ActorType.USER, memberUserId);
  folderMarkerKey = KeyStorePrefixes.ProjectFolderPermissionMarker(projectId, ActorType.USER, memberUserId);
});

afterAll(async () => {
  await testRedis.del(permissionDataKey, permissionMarkerKey, folderDataKey, folderMarkerKey);
  await testDb(TableName.Membership).where({ actorUserId: memberUserId }).del();
  await testDb(TableName.Users).where({ id: memberUserId }).del();
});

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
      actorUserId: memberUserId,
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

    // the read grant must override the member base role at the granted path (readValue yes,
    // edit no) while leaving every other path on the base member permissions
    const grantedPath = { environment: seedData1.environment.slug, secretPath: "/rbac-a/rbac-b" };
    expect(
      before.permission.can(
        ProjectPermissionSecretActions.ReadValue,
        subject(ProjectPermissionSub.Secrets, grantedPath)
      )
    ).toBe(true);
    expect(
      before.permission.can(ProjectPermissionSecretActions.Edit, subject(ProjectPermissionSub.Secrets, grantedPath))
    ).toBe(false);
    expect(
      before.permission.can(
        ProjectPermissionSecretActions.Edit,
        subject(ProjectPermissionSub.Secrets, { environment: seedData1.environment.slug, secretPath: "/" })
      )
    ).toBe(true);

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

    const versionAfterDelete = await getFolderVersion();
    expect(versionAfterDelete).toBeGreaterThan(versionAfter);

    // the folder cache marker lives 15s past the grant's deletion; drop it so later specs sharing
    // this user don't build abilities from the stale folder deny
    await testRedis.del(folderDataKey, folderMarkerKey);
  });

  test("ignores folder grants once the holder becomes a project admin", async () => {
    const folder = await createFolder({ path: "/", name: "rbac-admin-skip" });

    await testDb(TableName.AdditionalPrivilege).insert({
      name: "e2e-folder-rbac-admin-skip",
      actorUserId: memberUserId,
      projectId,
      folderId: folder.id,
      role: SecretFolderRole.Read,
      permissions: null,
      isTemporary: false
    });

    const grantedPath = { environment: seedData1.environment.slug, secretPath: "/rbac-admin-skip" };

    await testRedis.del(permissionDataKey, permissionMarkerKey, folderDataKey, folderMarkerKey);
    const asMember = await permissionService.getProjectPermission(permissionArg);
    expect(
      asMember.permission.can(ProjectPermissionSecretActions.Edit, subject(ProjectPermissionSub.Secrets, grantedPath))
    ).toBe(false);

    // grants cannot be created for admins, but a grant can predate a promotion to admin; the
    // promoted admin's ability must ignore it entirely
    await testDb(TableName.MembershipRole)
      .where({ membershipId: memberMembershipId })
      .update({ role: ProjectMembershipRole.Admin });

    try {
      await testRedis.del(permissionDataKey, permissionMarkerKey, folderDataKey, folderMarkerKey);
      const asAdmin = await permissionService.getProjectPermission(permissionArg);
      expect(asAdmin.folderScopedPrivileges).toEqual([]);
      expect(
        asAdmin.permission.can(ProjectPermissionSecretActions.Edit, subject(ProjectPermissionSub.Secrets, grantedPath))
      ).toBe(true);
    } finally {
      await testDb(TableName.MembershipRole)
        .where({ membershipId: memberMembershipId })
        .update({ role: ProjectMembershipRole.Member });
    }

    await deleteFolder({ path: "/", id: folder.id, forceDelete: true });
    await testRedis.del(permissionDataKey, permissionMarkerKey, folderDataKey, folderMarkerKey);
  });
});

describe("Folder deletion reaps folder-scoped privileges", () => {
  test("removes the additional_privilege row when the folder itself is deleted", async () => {
    const folder = await createFolder({ path: "/", name: "rbac-del-leaf" });

    await testDb(TableName.AdditionalPrivilege).insert({
      name: "e2e-folder-rbac-leaf",
      actorUserId: memberUserId,
      projectId,
      folderId: folder.id,
      role: SecretFolderRole.Read,
      permissions: null,
      isTemporary: false
    });

    await deleteFolder({ path: "/", id: folder.id });

    expect(await testDb(TableName.AdditionalPrivilege).where({ folderId: folder.id })).toEqual([]);
  });

  test("removes the additional_privilege row for a child folder when the parent folder is deleted", async () => {
    const parent = await createFolder({ path: "/", name: "rbac-del-parent" });
    const child = await createFolder({ path: "/rbac-del-parent", name: "rbac-del-child" });

    await testDb(TableName.AdditionalPrivilege).insert({
      name: "e2e-folder-rbac-child",
      actorUserId: memberUserId,
      projectId,
      folderId: child.id,
      role: SecretFolderRole.Read,
      permissions: null,
      isTemporary: false
    });

    await deleteFolder({ path: "/", id: parent.id, forceDelete: true });

    expect(await testDb(TableName.AdditionalPrivilege).where({ folderId: child.id })).toEqual([]);
  });
});
