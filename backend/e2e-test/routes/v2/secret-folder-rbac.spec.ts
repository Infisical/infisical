import {
  AccessScope,
  OrgMembershipRole,
  OrgMembershipStatus,
  ProjectMembershipRole,
  SecretFolderRole,
  TableName
} from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { createDomains } from "@app/domains/domains";
import type { TActorContext } from "@app/domains/lib/actor-context";
import { InstanceConfigCoreModule } from "@app/domains/platform/instance-config-core/ce/module";
import { ProjectPermissionSecretActions, ProjectPermissionSub } from "@app/domains/platform/projects/ce/module";
import type { TSecretsDomain } from "@app/domains/secrets-manager/secrets/ce/module";
import { keyValueStoreDALFactory } from "@app/keystore/key-value-store-dal";
import { keyStoreFactory, KeyStorePrefixes } from "@app/keystore/keystore";
import { ActorType, AuthMethod } from "@app/lib/auth/actor-types";
import { getConfig, initEnvConfig } from "@app/lib/config/env";
import { initLogger, logger } from "@app/lib/logger";
import { alphaNumericNanoId } from "@app/lib/nanoid";

const projectId = seedData1.project.id;
const orgId = seedData1.organization.id;

// the seed user is the project admin, and getProjectPermission skips folder grants for admins, so
// permission evaluation runs against a dedicated member user created in beforeAll
let memberUserId: string;
let memberMembershipId: string;

let actor: TActorContext;

// The routes' services are encapsulated in their plugin, so build the domains over the same DB and Redis the test
// server runs on.
let secretsDomain: Pick<TSecretsDomain, "getSecretsPermission">;

// The domains' cached folder grants for the member. Tests run with the cache marker off, so every read revalidates
// against the fingerprint (grants plus the folder version) and only this data entry is written.
let folderGrantsDataKey: string;
const folderVersionKey = KeyStorePrefixes.ProjectFolderPermissionVersion(projectId);

beforeAll(async () => {
  initLogger();
  await initEnvConfig(() => InstanceConfigCoreModule.readFipsSetting(testDb), logger);
  const keyStore = keyStoreFactory(getConfig(), keyValueStoreDALFactory(testDb));

  const domains = createDomains({
    db: testDb,
    keyStore,
    queueService: { queue: () => undefined, start: () => undefined },
    cronJob: { register: () => undefined },
    eventEmitter: { emit: () => undefined },
    envConfig: getConfig()
  } as unknown as Parameters<typeof createDomains>[0]);
  secretsDomain = domains.secrets.service;

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

  actor = await domains.actorContexts.forPrincipal(
    {
      type: ActorType.USER,
      id: memberUserId,
      username,
      email: username,
      authMethod: AuthMethod.EMAIL,
      isSuperAdmin: false
    },
    orgId
  );
  folderGrantsDataKey = `access-control:permission:data:${projectId}:${ActorType.USER}:${memberUserId}:secrets-folder-grants:v1`;
});

afterAll(async () => {
  await testRedis.del(folderGrantsDataKey);
  await testDb(TableName.Membership).where({ actorUserId: memberUserId }).del();
  await testDb(TableName.Users).where({ id: memberUserId }).del();
});

const clearMemberPermissionCaches = () => testRedis.del(folderGrantsDataKey);

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

const renameFolder = async (dto: { id: string; path: string; name: string }) => {
  const res = await testServer.inject({
    method: "PATCH",
    url: `/api/v2/folders/${dto.id}`,
    headers: {
      authorization: `Bearer ${jwtAuthToken}`
    },
    body: {
      projectId,
      environment: seedData1.environment.slug,
      path: dto.path,
      name: dto.name
    }
  });
  expect(res.statusCode).toBe(200);
  return res.json().folder;
};

const getFolderVersion = async () => {
  const row = await testDb(TableName.KeyValueStore).where({ key: folderVersionKey }).first();
  return Number(row?.integerValue ?? 0);
};

describe("Folder-scoped privilege permissions", () => {
  test("folder grants are cached for ten minutes under the member's folder grant key", async () => {
    const folder = await createFolder({ path: "/", name: "rbac-one-cache" });

    await testDb(TableName.AdditionalPrivilege).insert({
      name: "e2e-folder-rbac-one-cache",
      actorUserId: memberUserId,
      projectId,
      folderId: folder.id,
      role: SecretFolderRole.Read,
      permissions: null,
      isTemporary: false
    });

    try {
      await clearMemberPermissionCaches();
      await secretsDomain.getSecretsPermission({ actor, projectId });

      const [cachedBlob, dataTtl] = await Promise.all([
        testRedis.get(folderGrantsDataKey),
        testRedis.ttl(folderGrantsDataKey)
      ]);

      expect(dataTtl).toBeGreaterThan(540);
      expect(dataTtl).toBeLessThanOrEqual(600);
      const { payload } = JSON.parse(cachedBlob as string) as { payload: unknown[] };
      expect(payload).toHaveLength(1);
    } finally {
      await deleteFolder({ path: "/", id: folder.id, forceDelete: true });
      await clearMemberPermissionCaches();
    }
  });

  test("computes the folder path, refetches on an ancestor rename, and follows a move", async () => {
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
    await clearMemberPermissionCaches();
    const before = await secretsDomain.getSecretsPermission({ actor, projectId });
    expect(before.folderGrants).toEqual([
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
      before.permission.can({
        action: ProjectPermissionSecretActions.ReadValue,
        subject: ProjectPermissionSub.Secrets,
        fields: grantedPath
      })
    ).toBe(true);
    expect(
      before.permission.can({
        action: ProjectPermissionSecretActions.Edit,
        subject: ProjectPermissionSub.Secrets,
        fields: grantedPath
      })
    ).toBe(false);
    expect(
      before.permission.can({
        action: ProjectPermissionSecretActions.Edit,
        subject: ProjectPermissionSub.Secrets,
        fields: { environment: seedData1.environment.slug, secretPath: "/" }
      })
    ).toBe(true);

    const versionBefore = await getFolderVersion();

    // renaming the grant's parent leaves the privilege row untouched and only changes the derived
    // path, so the version counter is the only thing that can signal it
    await renameFolder({ id: folderA.id, path: "/", name: "rbac-a-renamed" });

    const [rowAfterRename] = await testDb(TableName.AdditionalPrivilege).where({ name: "e2e-folder-rbac" });
    expect(rowAfterRename.folderId).toBe(folderB.id);

    const versionAfterRename = await getFolderVersion();
    expect(versionAfterRename).toBeGreaterThan(versionBefore);

    // The cached grants with the pre-rename fingerprint stay, so the refetch below is driven by the version bump,
    // not by a cold cache.
    const afterRename = await secretsDomain.getSecretsPermission({ actor, projectId });
    expect(afterRename.folderGrants).toEqual([
      expect.objectContaining({ folderId: folderB.id, secretPath: "/rbac-a-renamed/rbac-b" })
    ]);

    await moveFolder({ folderId: folderA.id, destinationPath: "/rbac-dest" });

    const [privilegeRow] = await testDb(TableName.AdditionalPrivilege).where({ name: "e2e-folder-rbac" });
    expect(privilegeRow).toBeDefined();
    expect(privilegeRow.folderId).not.toBe(folderB.id);

    const versionAfterMove = await getFolderVersion();
    expect(versionAfterMove).toBeGreaterThan(versionAfterRename);

    const after = await secretsDomain.getSecretsPermission({ actor, projectId });
    expect(after.folderGrants).toEqual([
      expect.objectContaining({
        folderId: privilegeRow.folderId,
        role: SecretFolderRole.Read,
        environmentSlug: seedData1.environment.slug,
        secretPath: "/rbac-dest/rbac-a-renamed/rbac-b"
      })
    ]);

    await deleteFolder({ path: "/", id: folderDest.id, forceDelete: true });
    expect(await testDb(TableName.AdditionalPrivilege).where({ name: "e2e-folder-rbac" })).toEqual([]);

    const versionAfterDelete = await getFolderVersion();
    expect(versionAfterDelete).toBeGreaterThan(versionAfterMove);

    await clearMemberPermissionCaches();
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
