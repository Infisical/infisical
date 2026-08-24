import { randomUUID } from "node:crypto";

import { subject } from "@casl/ability";
import jwt from "jsonwebtoken";

import {
  AccessScope,
  ActionProjectType,
  IdentityAuthMethod,
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
import { ActorType, AuthMethod, AuthTokenType } from "@app/services/auth/auth-type";
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
let memberJwtToken: string;
const memberSessionId = randomUUID();

// grants in most specs belong to a third user so the acting member's own ability stays on the
// base member role; only the tier-specific specs grant to the acting member
let grantHolderUserId: string;

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

  const holderUsername = `folder-rbac-holder-${alphaNumericNanoId(8)}@example.com`.toLowerCase();
  const [grantHolder] = await testDb(TableName.Users)
    .insert({
      username: holderUsername,
      email: holderUsername,
      isGhost: false,
      isAccepted: true,
      authMethods: [AuthMethod.EMAIL]
    })
    .returning("*");
  grantHolderUserId = grantHolder.id;

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

  await testDb(TableName.AuthTokenSession).insert({
    id: memberSessionId,
    userId: memberUserId,
    ip: "127.0.0.1",
    userAgent: "e2e-folder-rbac",
    accessVersion: 1,
    refreshVersion: 1,
    lastUsed: new Date()
  } as never);

  memberJwtToken = jwt.sign(
    {
      authTokenType: AuthTokenType.ACCESS_TOKEN,
      userId: memberUserId,
      tokenVersionId: memberSessionId,
      authMethod: AuthMethod.EMAIL,
      organizationId: orgId,
      accessVersion: 1
    },
    getConfig().AUTH_SECRET,
    { expiresIn: 3600 }
  );
});

afterAll(async () => {
  await testRedis.del(permissionDataKey, permissionMarkerKey, folderDataKey, folderMarkerKey);
  await testDb(TableName.AuthTokenSession).where({ id: memberSessionId }).del();
  await testDb(TableName.Membership).where({ actorUserId: memberUserId }).del();
  await testDb(TableName.Users).whereIn("id", [memberUserId, grantHolderUserId]).del();
});

const clearMemberPermissionCaches = () =>
  testRedis.del(permissionDataKey, permissionMarkerKey, folderDataKey, folderMarkerKey);

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

describe("Folder deletion succeeds despite folder-scoped grants", () => {
  const deleteFolderAs = async (token: string, dto: { path: string; id: string; forceDelete?: boolean }) =>
    testServer.inject({
      method: "DELETE",
      url: `/api/v2/folders/${dto.id}`,
      headers: { authorization: `Bearer ${token}` },
      body: {
        projectId,
        environment: seedData1.environment.slug,
        path: dto.path,
        forceDelete: dto.forceDelete ?? false
      }
    });

  afterAll(async () => {
    await clearMemberPermissionCaches();
  });

  test("lets a member with delete permission delete a folder that has a grant, reaping the grant", async () => {
    const folder = await createFolder({ path: "/", name: "rbac-guard-direct" });

    await testDb(TableName.AdditionalPrivilege).insert({
      name: "e2e-rbac-guard-direct",
      actorUserId: grantHolderUserId,
      projectId,
      folderId: folder.id,
      role: SecretFolderRole.Read,
      permissions: null,
      isTemporary: false
    });

    const res = await deleteFolderAs(memberJwtToken, { path: "/", id: folder.id });
    expect(res.statusCode).toBe(200);
    expect(await testDb(TableName.AdditionalPrivilege).where({ folderId: folder.id })).toEqual([]);
  });

  test("lets a member delete a parent whose descendant folder has a grant", async () => {
    const parent = await createFolder({ path: "/", name: "rbac-guard-parent" });
    const child = await createFolder({ path: "/rbac-guard-parent", name: "rbac-guard-child" });

    await testDb(TableName.AdditionalPrivilege).insert({
      name: "e2e-rbac-guard-child",
      actorUserId: grantHolderUserId,
      projectId,
      folderId: child.id,
      role: SecretFolderRole.Read,
      permissions: null,
      isTemporary: false
    });

    const res = await deleteFolderAs(memberJwtToken, { path: "/", id: parent.id, forceDelete: true });
    expect(res.statusCode).toBe(200);
    expect(await testDb(TableName.AdditionalPrivilege).where({ folderId: child.id })).toEqual([]);
  });

  test("lets a member holding the full-access tier delete their granted folder", async () => {
    const folder = await createFolder({ path: "/", name: "rbac-guard-full" });

    await testDb(TableName.AdditionalPrivilege).insert({
      name: "e2e-rbac-guard-full",
      actorUserId: memberUserId,
      projectId,
      folderId: folder.id,
      role: SecretFolderRole.FullAccess,
      permissions: null,
      isTemporary: false
    });
    await clearMemberPermissionCaches();

    const res = await deleteFolderAs(memberJwtToken, { path: "/", id: folder.id });
    expect(res.statusCode).toBe(200);
    expect(await testDb(TableName.AdditionalPrivilege).where({ folderId: folder.id })).toEqual([]);
    await clearMemberPermissionCaches();
  });

  test("lets an identity with delete permission delete a folder that has a grant", async () => {
    const identityName = `rbac-guard-identity-${alphaNumericNanoId(8)}`.toLowerCase();
    const [identity] = await testDb(TableName.Identity).insert({ name: identityName, orgId }).returning("*");
    const [orgMembership] = await testDb(TableName.Membership)
      .insert({ scope: AccessScope.Organization, scopeOrgId: orgId, actorIdentityId: identity.id })
      .returning("*");
    await testDb(TableName.MembershipRole).insert({ membershipId: orgMembership.id, role: OrgMembershipRole.Member });
    const [projectMembership] = await testDb(TableName.Membership)
      .insert({
        scope: AccessScope.Project,
        scopeOrgId: orgId,
        scopeProjectId: projectId,
        actorIdentityId: identity.id
      })
      .returning("*");
    await testDb(TableName.MembershipRole).insert({
      membershipId: projectMembership.id,
      role: ProjectMembershipRole.Member
    });

    const identityTokenId = randomUUID();
    await testDb(TableName.IdentityAccessToken).insert({
      id: identityTokenId,
      identityId: identity.id,
      accessTokenTTL: 3600,
      accessTokenMaxTTL: 7200,
      accessTokenNumUses: 0,
      accessTokenNumUsesLimit: 0,
      isAccessTokenRevoked: false,
      authMethod: IdentityAuthMethod.UNIVERSAL_AUTH,
      accessTokenPeriod: 0
    } as never);

    const identityJwt = jwt.sign(
      {
        authTokenType: AuthTokenType.IDENTITY_ACCESS_TOKEN,
        identityId: identity.id,
        identityAccessTokenId: identityTokenId,
        clientSecretId: ""
      },
      getConfig().AUTH_SECRET,
      { expiresIn: 3600 }
    );

    const folder = await createFolder({ path: "/", name: "rbac-guard-identity" });
    await testDb(TableName.AdditionalPrivilege).insert({
      name: "e2e-rbac-guard-identity",
      actorUserId: grantHolderUserId,
      projectId,
      folderId: folder.id,
      role: SecretFolderRole.Read,
      permissions: null,
      isTemporary: false
    });

    try {
      const res = await deleteFolderAs(identityJwt, { path: "/", id: folder.id });
      expect(res.statusCode).toBe(200);
      expect(await testDb(TableName.AdditionalPrivilege).where({ folderId: folder.id })).toEqual([]);
    } finally {
      // no assertion: the folder is already gone when the deletion under test succeeded
      await deleteFolderAs(jwtAuthToken, { path: "/", id: folder.id, forceDelete: true });
      await testDb(TableName.IdentityAccessToken).where({ id: identityTokenId }).del();
      await testDb(TableName.Membership).where({ actorIdentityId: identity.id }).del();
      await testDb(TableName.Identity).where({ id: identity.id }).del();
    }
  });
});

describe("Folder move and rename succeed despite folder-scoped grants", () => {
  const moveFolderAs = (token: string, dto: { folderId: string; destinationPath: string }) =>
    testServer.inject({
      method: "POST",
      url: `/api/v2/folders/move`,
      headers: { authorization: `Bearer ${token}` },
      body: {
        projectId,
        folderId: dto.folderId,
        destinationEnvironment: seedData1.environment.slug,
        destinationPath: dto.destinationPath
      }
    });

  // cleanup for folders that may or may not still exist at the given path, depending on
  // whether the operation under test succeeded
  const tryDeleteFolder = (dto: { path: string; id: string }) =>
    testServer.inject({
      method: "DELETE",
      url: `/api/v2/folders/${dto.id}`,
      headers: { authorization: `Bearer ${jwtAuthToken}` },
      body: { projectId, environment: seedData1.environment.slug, path: dto.path, forceDelete: true }
    });

  const renameFolderAs = (token: string, dto: { id: string; path: string; name: string; description?: string }) =>
    testServer.inject({
      method: "PATCH",
      url: `/api/v2/folders/${dto.id}`,
      headers: { authorization: `Bearer ${token}` },
      body: {
        projectId,
        environment: seedData1.environment.slug,
        path: dto.path,
        name: dto.name,
        description: dto.description
      }
    });

  const renameFolderBatchAs = (token: string, dto: { id: string; path: string; name: string }) =>
    testServer.inject({
      method: "PATCH",
      url: `/api/v2/folders/batch`,
      headers: { authorization: `Bearer ${token}` },
      body: {
        projectId,
        folders: [{ id: dto.id, environment: seedData1.environment.slug, path: dto.path, name: dto.name }]
      }
    });

  const grantFolderRole = (dto: { name: string; folderId: string; role: SecretFolderRole; actorUserId?: string }) =>
    testDb(TableName.AdditionalPrivilege).insert({
      name: dto.name,
      actorUserId: dto.actorUserId ?? grantHolderUserId,
      projectId,
      folderId: dto.folderId,
      role: dto.role,
      permissions: null,
      isTemporary: false
    });

  afterAll(async () => {
    await clearMemberPermissionCaches();
  });

  test("lets a member move a folder that has a grant, repointing the grant", async () => {
    const folder = await createFolder({ path: "/", name: "rbac-move-src" });
    const destination = await createFolder({ path: "/", name: "rbac-move-dest" });

    try {
      await grantFolderRole({ name: "e2e-rbac-move", folderId: folder.id, role: SecretFolderRole.Read });

      const res = await moveFolderAs(memberJwtToken, { folderId: folder.id, destinationPath: "/rbac-move-dest" });
      expect(res.statusCode).toBe(200);

      // the moved folder is recreated under a new id and the grant must follow it
      const [privilege] = await testDb(TableName.AdditionalPrivilege).where({ name: "e2e-rbac-move" });
      expect(privilege).toBeDefined();
      expect(privilege.folderId).not.toBe(folder.id);
    } finally {
      await tryDeleteFolder({ path: "/", id: folder.id });
      await deleteFolder({ path: "/", id: destination.id, forceDelete: true });
    }
  });

  test("lets a member move a parent whose descendant folder has a grant", async () => {
    const parent = await createFolder({ path: "/", name: "rbac-move-parent" });
    const child = await createFolder({ path: "/rbac-move-parent", name: "rbac-move-child" });
    const destination = await createFolder({ path: "/", name: "rbac-move-parent-dest" });

    try {
      await grantFolderRole({ name: "e2e-rbac-move-child", folderId: child.id, role: SecretFolderRole.Read });

      const res = await moveFolderAs(memberJwtToken, {
        folderId: parent.id,
        destinationPath: "/rbac-move-parent-dest"
      });
      expect(res.statusCode).toBe(200);

      const [privilege] = await testDb(TableName.AdditionalPrivilege).where({ name: "e2e-rbac-move-child" });
      expect(privilege).toBeDefined();
      expect(privilege.folderId).not.toBe(child.id);
    } finally {
      await tryDeleteFolder({ path: "/", id: parent.id });
      await deleteFolder({ path: "/", id: destination.id, forceDelete: true });
    }
  });

  test("lets a member rename a folder that has a grant", async () => {
    const folder = await createFolder({ path: "/", name: "rbac-rename-src" });

    try {
      await grantFolderRole({ name: "e2e-rbac-rename", folderId: folder.id, role: SecretFolderRole.Read });

      const res = await renameFolderAs(memberJwtToken, {
        id: folder.id,
        path: "/",
        name: "rbac-rename-src-renamed"
      });
      expect(res.statusCode).toBe(200);
    } finally {
      await deleteFolder({ path: "/", id: folder.id, forceDelete: true });
    }
  });

  test("lets the batch route rename a folder that has a grant", async () => {
    const folder = await createFolder({ path: "/", name: "rbac-rename-batch" });

    try {
      await grantFolderRole({ name: "e2e-rbac-rename-batch", folderId: folder.id, role: SecretFolderRole.Read });

      const res = await renameFolderBatchAs(memberJwtToken, {
        id: folder.id,
        path: "/",
        name: "rbac-rename-batch-renamed"
      });
      expect(res.statusCode).toBe(200);
    } finally {
      await deleteFolder({ path: "/", id: folder.id, forceDelete: true });
    }
  });

  test("lets a member update the description of a granted folder", async () => {
    const folder = await createFolder({ path: "/", name: "rbac-rename-desc" });

    try {
      await grantFolderRole({ name: "e2e-rbac-rename-desc", folderId: folder.id, role: SecretFolderRole.Read });

      const res = await renameFolderAs(memberJwtToken, {
        id: folder.id,
        path: "/",
        name: "rbac-rename-desc",
        description: "updated by a member without manage-access"
      });
      expect(res.statusCode).toBe(200);
    } finally {
      await deleteFolder({ path: "/", id: folder.id, forceDelete: true });
    }
  });

  test("lets a full-access grant holder rename and move their granted folder", async () => {
    const folder = await createFolder({ path: "/", name: "rbac-relocate-full" });
    const destination = await createFolder({ path: "/", name: "rbac-relocate-full-dest" });

    try {
      await grantFolderRole({
        name: "e2e-rbac-relocate-full",
        folderId: folder.id,
        role: SecretFolderRole.FullAccess,
        actorUserId: memberUserId
      });
      await clearMemberPermissionCaches();

      const renamed = await renameFolderAs(memberJwtToken, {
        id: folder.id,
        path: "/",
        name: "rbac-relocate-full-renamed"
      });
      expect(renamed.statusCode).toBe(200);

      await clearMemberPermissionCaches();
      const moved = await moveFolderAs(memberJwtToken, {
        folderId: folder.id,
        destinationPath: "/rbac-relocate-full-dest"
      });
      expect(moved.statusCode).toBe(200);

      const [privilege] = await testDb(TableName.AdditionalPrivilege).where({ name: "e2e-rbac-relocate-full" });
      expect(privilege).toBeDefined();
      expect(privilege.folderId).not.toBe(folder.id);
    } finally {
      await tryDeleteFolder({ path: "/", id: folder.id });
      await deleteFolder({ path: "/", id: destination.id, forceDelete: true });
      await clearMemberPermissionCaches();
    }
  });
});

describe("Permission audit endpoint folder grants", () => {
  test("includeFolderPermissions=false excludes folder grants from audit sources", async () => {
    const folder = await createFolder({ path: "/", name: "rbac-audit" });
    await testDb(TableName.AdditionalPrivilege).insert({
      name: "e2e-folder-rbac-audit",
      actorUserId: memberUserId,
      projectId,
      folderId: folder.id,
      role: SecretFolderRole.Read,
      permissions: null,
      isTemporary: false
    });

    const getAuditSources = async (query: string) => {
      const res = await testServer.inject({
        method: "GET",
        url: `/api/v1/projects/${projectId}/memberships/${memberMembershipId}/permissions/audit${query}`,
        headers: { authorization: `Bearer ${jwtAuthToken}` }
      });
      expect(res.statusCode).toBe(200);
      return res.json().sources as { name: string }[];
    };

    try {
      const defaultSources = await getAuditSources("");
      expect(defaultSources.some((s) => s.name === "e2e-folder-rbac-audit")).toBe(true);

      const gatedSources = await getAuditSources("?includeFolderPermissions=false");
      expect(gatedSources.some((s) => s.name === "e2e-folder-rbac-audit")).toBe(false);
      expect(gatedSources.length).toBeGreaterThan(0);
    } finally {
      await deleteFolder({ path: "/", id: folder.id, forceDelete: true });
    }
  });
});
