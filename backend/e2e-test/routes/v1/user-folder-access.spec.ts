import {
  AccessScope,
  OrgMembershipRole,
  OrgMembershipStatus,
  ProjectMembershipRole,
  SecretFolderRole,
  TableName,
  TemporaryPermissionMode
} from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { groupDALFactory } from "@app/ee/services/group/group-dal";
import { removeUsersFromGroupByUserIds } from "@app/ee/services/group/group-fns";
import { reapDeletedGroupFolderGrants } from "@app/ee/services/group/group-folder-grant-fns";
import { identityGroupMembershipDALFactory } from "@app/ee/services/group/identity-group-membership-dal";
import { userGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";
import { KeyStorePrefixes } from "@app/keystore/keystore";
import { ms } from "@app/lib/ms";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { additionalPrivilegeDALFactory } from "@app/services/additional-privilege/additional-privilege-dal";
import { alertChannelRecipientDALFactory } from "@app/services/alert/alert-channel-recipient-dal";
import { AuthMethod } from "@app/services/auth/auth-type";
import { membershipGroupDALFactory } from "@app/services/membership-group/membership-group-dal";
import { projectKeyDALFactory } from "@app/services/project-key/project-key-dal";
import { userDALFactory } from "@app/services/user/user-dal";

const projectId = seedData1.project.id;
const orgId = seedData1.organization.id;
// the seed user is the project admin; admins cannot receive folder grants, so tests grant to a
// dedicated member user created in beforeAll
let memberUserId: string;

const folderTarget = {
  environmentSlug: seedData1.environment.slug,
  secretPath: "/user-folder-access"
};

const folderAccessUrl = (targetUserId?: string) =>
  `/api/v1/projects/${projectId}/users/${targetUserId ?? memberUserId}/secret-folder-access`;

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

const createProjectUser = async (role: ProjectMembershipRole) => {
  const username = `folder-access-${alphaNumericNanoId(8)}@example.com`.toLowerCase();
  const [user] = await testDb(TableName.Users)
    .insert({ username, email: username, isGhost: false, isAccepted: true, authMethods: [AuthMethod.EMAIL] })
    .returning("*");

  const [orgMembership] = await testDb(TableName.Membership)
    .insert({
      scope: AccessScope.Organization,
      scopeOrgId: orgId,
      actorUserId: user.id,
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
      actorUserId: user.id
    })
    .returning("*");
  await testDb(TableName.MembershipRole).insert({ membershipId: projectMembership.id, role });

  return {
    userId: user.id,
    email: username,
    projectMembershipId: projectMembership.id
  };
};

const deleteProjectUser = async (id: string) => {
  await testDb(TableName.Membership).where({ actorUserId: id }).del();
  await testDb(TableName.Users).where({ id }).del();
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
    const member = await createProjectUser(ProjectMembershipRole.Member);
    memberUserId = member.userId;
  });

  afterAll(async () => {
    await deleteFolder({ path: "/", id: folder.id });
    await deleteProjectUser(memberUserId);
  });

  test("full lifecycle: create, conflict, get, list, patch, delete", async () => {
    const versionBefore = await getFolderPermissionVersion();

    const createRes = await testServer.inject({
      method: "POST",
      url: folderAccessUrl(),
      headers: authHeaders(),
      body: { ...folderTarget, permission: SecretFolderRole.Read }
    });
    expect(createRes.statusCode).toBe(200);
    const created = createRes.json().folderAccess;
    expect(created).toEqual(
      expect.objectContaining({
        projectId,
        folderId: folder.id,
        userId: memberUserId,
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
      url: folderAccessUrl(),
      headers: authHeaders(),
      body: { ...folderTarget, permission: SecretFolderRole.Edit }
    });
    expect(conflictRes.statusCode).toBe(400);
    expect(conflictRes.json().message).toContain("already has folder access");

    const temporaryAccessStartTime = new Date().toISOString();
    const patchRes = await testServer.inject({
      method: "PATCH",
      url: folderAccessUrl(),
      headers: authHeaders(),
      body: {
        ...folderTarget,
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
      url: folderAccessUrl(),
      headers: authHeaders(),
      body: { ...folderTarget, type: { isTemporary: false } }
    });
    expect(permanentRes.statusCode).toBe(200);
    const permanent = permanentRes.json().folderAccess;
    expect(permanent.isTemporary).toBe(false);
    expect(permanent.temporaryRange).toBeNull();
    expect(permanent.temporaryAccessStartTime).toBeNull();
    expect(permanent.temporaryAccessEndTime).toBeNull();

    const emptyPatchRes = await testServer.inject({
      method: "PATCH",
      url: folderAccessUrl(),
      headers: authHeaders(),
      body: { ...folderTarget }
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
      url: folderAccessUrl(),
      headers: authHeaders(),
      body: { ...folderTarget }
    });
    expect(deleteRes.statusCode).toBe(200);
    expect(deleteRes.json().folderAccess.id).toBe(created.id);

    expect(await testDb(TableName.AdditionalPrivilege).where({ id: created.id })).toEqual([]);

    const deleteAgainRes = await testServer.inject({
      method: "DELETE",
      url: folderAccessUrl(),
      headers: authHeaders(),
      body: { ...folderTarget }
    });
    expect(deleteAgainRes.statusCode).toBe(404);
  });

  describe("group removal reaps folder grants", () => {
    let reapUserId: string;
    let pendingReapUserId: string;
    let firstGroup: { id: string; name: string; slug: string; orgId: string };
    let secondGroup: { id: string; name: string; slug: string; orgId: string };
    let removalDeps: Omit<
      Parameters<typeof removeUsersFromGroupByUserIds>[0],
      "group" | "userIds" | "tx" | "shouldFailOnMissingMembers" | "usageMeteringService"
    >;

    const createProjectGroup = async () => {
      const slug = `folder-reap-grp-${alphaNumericNanoId(8)}`.toLowerCase();
      const [group] = await testDb(TableName.Groups).insert({ orgId, name: slug, slug }).returning("*");

      for (const scope of [AccessScope.Organization, AccessScope.Project] as const) {
        // eslint-disable-next-line no-await-in-loop
        const [membership] = await testDb(TableName.Membership)
          .insert({
            scope,
            scopeOrgId: orgId,
            scopeProjectId: scope === AccessScope.Project ? projectId : null,
            actorGroupId: group.id
          })
          .returning("*");
        // eslint-disable-next-line no-await-in-loop
        await testDb(TableName.MembershipRole).insert({
          membershipId: membership.id,
          role: scope === AccessScope.Project ? ProjectMembershipRole.Member : OrgMembershipRole.Member
        });
      }

      return { id: group.id, name: group.name, slug: group.slug, orgId };
    };

    beforeAll(async () => {
      removalDeps = {
        userDAL: userDALFactory(testDb),
        userGroupMembershipDAL: userGroupMembershipDALFactory(testDb),
        membershipGroupDAL: membershipGroupDALFactory(testDb),
        groupDAL: groupDALFactory(testDb),
        projectKeyDAL: projectKeyDALFactory(testDb),
        additionalPrivilegeDAL: additionalPrivilegeDALFactory(testDb),
        alertChannelRecipientDAL: alertChannelRecipientDALFactory(testDb),
        eventEmitter: { emit: async () => {} }
      };

      const username = `folder-reap-${alphaNumericNanoId(8)}@example.com`;
      const [user] = await testDb(TableName.Users)
        .insert({ username, email: username, isGhost: false, isAccepted: true, authMethods: [AuthMethod.EMAIL] })
        .returning("*");
      reapUserId = user.id;

      const [orgMembership] = await testDb(TableName.Membership)
        .insert({
          scope: AccessScope.Organization,
          scopeOrgId: orgId,
          actorUserId: reapUserId,
          status: OrgMembershipStatus.Accepted,
          isActive: true
        })
        .returning("*");
      await testDb(TableName.MembershipRole).insert({
        membershipId: orgMembership.id,
        role: OrgMembershipRole.Member
      });

      firstGroup = await createProjectGroup();
      secondGroup = await createProjectGroup();
      await testDb(TableName.UserGroupMembership).insert([
        { userId: reapUserId, groupId: firstGroup.id },
        { userId: reapUserId, groupId: secondGroup.id }
      ]);

      const pendingUsername = `folder-reap-pending-${alphaNumericNanoId(8)}@example.com`;
      const [pendingUser] = await testDb(TableName.Users)
        .insert({
          username: pendingUsername,
          email: pendingUsername,
          isGhost: false,
          isAccepted: false,
          authMethods: [AuthMethod.EMAIL]
        })
        .returning("*");
      pendingReapUserId = pendingUser.id;

      const [pendingOrgMembership] = await testDb(TableName.Membership)
        .insert({
          scope: AccessScope.Organization,
          scopeOrgId: orgId,
          actorUserId: pendingReapUserId,
          status: OrgMembershipStatus.Invited,
          isActive: true
        })
        .returning("*");
      await testDb(TableName.MembershipRole).insert({
        membershipId: pendingOrgMembership.id,
        role: OrgMembershipRole.Member
      });

      await testDb(TableName.UserGroupMembership).insert([
        { userId: pendingReapUserId, groupId: firstGroup.id, isPending: true },
        { userId: pendingReapUserId, groupId: secondGroup.id, isPending: true }
      ]);
    });

    afterAll(async () => {
      const groupIds = [firstGroup.id, secondGroup.id];
      await testDb(TableName.AdditionalPrivilege).whereIn("actorUserId", [reapUserId, pendingReapUserId]).del();
      await testDb(TableName.UserGroupMembership).whereIn("groupId", groupIds).del();
      await testDb(TableName.Membership).whereIn("actorGroupId", groupIds).del();
      await testDb(TableName.Groups).whereIn("id", groupIds).del();
      await deleteProjectUser(reapUserId);
      await deleteProjectUser(pendingReapUserId);
    });

    test("deletes the grant only when the last group-derived project access is removed", async () => {
      const createRes = await testServer.inject({
        method: "POST",
        url: folderAccessUrl(reapUserId),
        headers: authHeaders(),
        body: { ...folderTarget, permission: SecretFolderRole.Read }
      });
      expect(createRes.statusCode).toBe(200);
      const grantId = createRes.json().folderAccess.id;

      await removeUsersFromGroupByUserIds({ ...removalDeps, group: firstGroup, userIds: [reapUserId] });

      // still reaches the project through the second group, so the grant survives untouched
      expect(await testDb(TableName.AdditionalPrivilege).where({ id: grantId })).toHaveLength(1);

      await removeUsersFromGroupByUserIds({ ...removalDeps, group: secondGroup, userIds: [reapUserId] });

      expect(await testDb(TableName.AdditionalPrivilege).where({ id: grantId })).toEqual([]);
    });

    test("deletes a pending user's grant only when the last group-derived project access is removed", async () => {
      const createRes = await testServer.inject({
        method: "POST",
        url: folderAccessUrl(pendingReapUserId),
        headers: authHeaders(),
        body: { ...folderTarget, permission: SecretFolderRole.Read }
      });
      expect(createRes.statusCode).toBe(200);
      const grantId = createRes.json().folderAccess.id;

      await removeUsersFromGroupByUserIds({ ...removalDeps, group: firstGroup, userIds: [pendingReapUserId] });

      expect(await testDb(TableName.AdditionalPrivilege).where({ id: grantId })).toHaveLength(1);

      await removeUsersFromGroupByUserIds({ ...removalDeps, group: secondGroup, userIds: [pendingReapUserId] });

      expect(await testDb(TableName.AdditionalPrivilege).where({ id: grantId })).toEqual([]);
    });
  });
  describe("group deletion reaps folder grants", () => {
    let groupOnlyUserId: string;
    let directMemberUserId: string;
    let soleGroupId: string;
    let firstOfTwoGroupsId: string;
    let secondOfTwoGroupsId: string;
    let reapDeps: Parameters<typeof reapDeletedGroupFolderGrants>[0];

    const createProjectGroup = async () => {
      const slug = `folder-del-grp-${alphaNumericNanoId(8)}`.toLowerCase();
      const [group] = await testDb(TableName.Groups).insert({ orgId, name: slug, slug }).returning("*");

      for (const scope of [AccessScope.Organization, AccessScope.Project] as const) {
        // eslint-disable-next-line no-await-in-loop
        const [membership] = await testDb(TableName.Membership)
          .insert({
            scope,
            scopeOrgId: orgId,
            scopeProjectId: scope === AccessScope.Project ? projectId : null,
            actorGroupId: group.id
          })
          .returning("*");
        // eslint-disable-next-line no-await-in-loop
        await testDb(TableName.MembershipRole).insert({
          membershipId: membership.id,
          role: scope === AccessScope.Project ? ProjectMembershipRole.Member : OrgMembershipRole.Member
        });
      }

      return group.id;
    };

    const createOrgOnlyUser = async () => {
      const username = `folder-del-${alphaNumericNanoId(8)}@example.com`;
      const [user] = await testDb(TableName.Users)
        .insert({ username, email: username, isGhost: false, isAccepted: true, authMethods: [AuthMethod.EMAIL] })
        .returning("*");

      const [orgMembership] = await testDb(TableName.Membership)
        .insert({
          scope: AccessScope.Organization,
          scopeOrgId: orgId,
          actorUserId: user.id,
          status: OrgMembershipStatus.Accepted,
          isActive: true
        })
        .returning("*");
      await testDb(TableName.MembershipRole).insert({
        membershipId: orgMembership.id,
        role: OrgMembershipRole.Member
      });

      return user.id;
    };

    const grantFolderAccess = async (targetUserId: string) => {
      const res = await testServer.inject({
        method: "POST",
        url: folderAccessUrl(targetUserId),
        headers: authHeaders(),
        body: { ...folderTarget, permission: SecretFolderRole.Read }
      });
      expect(res.statusCode).toBe(200);
      return res.json().folderAccess.id as string;
    };

    // the group row is what production deletes; its memberships go by ON DELETE CASCADE
    const deleteGroupRow = async (groupId: string) => {
      await testDb(TableName.Groups).where({ id: groupId }).del();
    };

    beforeAll(async () => {
      reapDeps = {
        userGroupMembershipDAL: userGroupMembershipDALFactory(testDb),
        identityGroupMembershipDAL: identityGroupMembershipDALFactory(testDb),
        membershipGroupDAL: membershipGroupDALFactory(testDb),
        additionalPrivilegeDAL: additionalPrivilegeDALFactory(testDb)
      };

      groupOnlyUserId = await createOrgOnlyUser();
      ({ userId: directMemberUserId } = await createProjectUser(ProjectMembershipRole.Member));

      soleGroupId = await createProjectGroup();
      firstOfTwoGroupsId = await createProjectGroup();
      secondOfTwoGroupsId = await createProjectGroup();

      await testDb(TableName.UserGroupMembership).insert([
        { userId: groupOnlyUserId, groupId: soleGroupId },
        { userId: directMemberUserId, groupId: soleGroupId }
      ]);
    });

    afterAll(async () => {
      const groupIds = [soleGroupId, firstOfTwoGroupsId, secondOfTwoGroupsId];
      await testDb(TableName.AdditionalPrivilege).whereIn("actorUserId", [groupOnlyUserId, directMemberUserId]).del();
      await testDb(TableName.UserGroupMembership).whereIn("groupId", groupIds).del();
      await testDb(TableName.Membership).whereIn("actorGroupId", groupIds).del();
      await testDb(TableName.Groups).whereIn("id", groupIds).del();
      await deleteProjectUser(groupOnlyUserId);
      await deleteProjectUser(directMemberUserId);
    });

    test("reaps the group-only member's grant and keeps the direct project member's", async () => {
      const groupOnlyGrantId = await grantFolderAccess(groupOnlyUserId);
      const directMemberGrantId = await grantFolderAccess(directMemberUserId);
      const versionBefore = await getFolderPermissionVersion();

      await reapDeletedGroupFolderGrants(reapDeps, soleGroupId, testDb);
      await deleteGroupRow(soleGroupId);

      expect(await testDb(TableName.AdditionalPrivilege).where({ id: groupOnlyGrantId })).toEqual([]);
      // the direct project membership is still a route into the project, so this grant is untouched
      expect(await testDb(TableName.AdditionalPrivilege).where({ id: directMemberGrantId })).toHaveLength(1);
      // the deleted memberships are already part of the permission fingerprint; no bump is owed
      expect(await getFolderPermissionVersion()).toBe(versionBefore);
    });

    test("keeps the grant until the last group reaching the project is deleted", async () => {
      const secondGroupOnlyUserId = await createOrgOnlyUser();
      await testDb(TableName.UserGroupMembership).insert([
        { userId: secondGroupOnlyUserId, groupId: firstOfTwoGroupsId },
        { userId: secondGroupOnlyUserId, groupId: secondOfTwoGroupsId }
      ]);

      const grantId = await grantFolderAccess(secondGroupOnlyUserId);

      await reapDeletedGroupFolderGrants(reapDeps, firstOfTwoGroupsId, testDb);
      await deleteGroupRow(firstOfTwoGroupsId);

      expect(await testDb(TableName.AdditionalPrivilege).where({ id: grantId })).toHaveLength(1);

      await reapDeletedGroupFolderGrants(reapDeps, secondOfTwoGroupsId, testDb);
      await deleteGroupRow(secondOfTwoGroupsId);

      expect(await testDb(TableName.AdditionalPrivilege).where({ id: grantId })).toEqual([]);

      await deleteProjectUser(secondGroupOnlyUserId);
    });

    test("reaps only folder grants, leaving the actor's other privileges alone", async () => {
      const otherUserId = await createOrgOnlyUser();
      const otherGroupId = await createProjectGroup();
      await testDb(TableName.UserGroupMembership).insert({ userId: otherUserId, groupId: otherGroupId });

      const folderGrantId = await grantFolderAccess(otherUserId);
      const [projectPrivilege] = await testDb(TableName.AdditionalPrivilege)
        .insert({
          name: `proj-priv-${alphaNumericNanoId(8)}`,
          actorUserId: otherUserId,
          projectId,
          permissions: JSON.stringify([])
        })
        .returning("*");
      const [orgPrivilege] = await testDb(TableName.AdditionalPrivilege)
        .insert({
          name: `org-priv-${alphaNumericNanoId(8)}`,
          actorUserId: otherUserId,
          orgId,
          permissions: JSON.stringify([])
        })
        .returning("*");

      await reapDeletedGroupFolderGrants(reapDeps, otherGroupId, testDb);
      await deleteGroupRow(otherGroupId);

      expect(await testDb(TableName.AdditionalPrivilege).where({ id: folderGrantId })).toEqual([]);
      expect(await testDb(TableName.AdditionalPrivilege).where({ id: projectPrivilege.id })).toHaveLength(1);
      expect(await testDb(TableName.AdditionalPrivilege).where({ id: orgPrivilege.id })).toHaveLength(1);

      await testDb(TableName.AdditionalPrivilege).where({ actorUserId: otherUserId }).del();
      await testDb(TableName.UserGroupMembership).where({ groupId: otherGroupId }).del();
      await testDb(TableName.Membership).where({ actorGroupId: otherGroupId }).del();
      await deleteProjectUser(otherUserId);
    });
  });
});
