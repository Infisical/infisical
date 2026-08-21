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
import { KeyStorePrefixes } from "@app/keystore/keystore";
import { ms } from "@app/lib/ms";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { AuthMethod } from "@app/services/auth/auth-type";

const projectId = seedData1.project.id;
const orgId = seedData1.organization.id;
// the seed user is the project admin; admins cannot receive folder grants, so tests grant to a
// dedicated member user created in beforeAll
const adminUserId = seedData1.id;

let memberUserId: string;
let memberEmail: string;
let memberProjectMembershipId: string;

const folderTarget = {
  environmentSlug: seedData1.environment.slug,
  secretPath: "/user-folder-access"
};

const folderAccessUrl = (targetUserId?: string) =>
  `/api/v1/projects/${projectId}/users/${targetUserId ?? memberUserId}/secret-folder-access`;

const folderAccessUsersUrl = (query = "", target: { environmentSlug: string; secretPath: string } = folderTarget) =>
  `/api/v1/projects/${projectId}/secret-folder-access/users?environmentSlug=${encodeURIComponent(
    target.environmentSlug
  )}&secretPath=${encodeURIComponent(target.secretPath)}${query}`;

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
    memberEmail = member.email;
    memberProjectMembershipId = member.projectMembershipId;
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

  test("returns 404 for an unknown secret path", async () => {
    const res = await testServer.inject({
      method: "POST",
      url: folderAccessUrl(),
      headers: authHeaders(),
      body: { ...folderTarget, secretPath: "/no-such-folder", permission: SecretFolderRole.Read }
    });
    expect(res.statusCode).toBe(404);
  });

  test("returns 404 for an unknown environment", async () => {
    const res = await testServer.inject({
      method: "POST",
      url: folderAccessUrl(),
      headers: authHeaders(),
      body: { ...folderTarget, environmentSlug: "no-such-env", permission: SecretFolderRole.Read }
    });
    expect(res.statusCode).toBe(404);
  });

  test("returns 400 for a malformed secret path", async () => {
    const res = await testServer.inject({
      method: "POST",
      url: folderAccessUrl(),
      headers: authHeaders(),
      body: { ...folderTarget, secretPath: "/bad name!", permission: SecretFolderRole.Read }
    });
    expect(res.statusCode).toBe(400);
  });

  test("returns 404 for a target that is not a project member", async () => {
    const res = await testServer.inject({
      method: "POST",
      url: folderAccessUrl("00000000-0000-0000-0000-000000000000"),
      headers: authHeaders(),
      body: { ...folderTarget, permission: SecretFolderRole.Read }
    });
    expect(res.statusCode).toBe(404);
  });

  test("rejects an unknown role", async () => {
    const res = await testServer.inject({
      method: "POST",
      url: folderAccessUrl(),
      headers: authHeaders(),
      body: { ...folderTarget, permission: "owner" }
    });
    expect(res.statusCode).toBe(422);
  });

  test("normalizes a trailing-slash secret path", async () => {
    const createRes = await testServer.inject({
      method: "POST",
      url: folderAccessUrl(),
      headers: authHeaders(),
      body: { ...folderTarget, secretPath: `${folderTarget.secretPath}/`, permission: SecretFolderRole.Read }
    });
    expect(createRes.statusCode).toBe(200);
    const created = createRes.json().folderAccess;
    expect(created.folderId).toBe(folder.id);
    expect(created.secretPath).toBe(folderTarget.secretPath);

    const deleteRes = await testServer.inject({
      method: "DELETE",
      url: folderAccessUrl(),
      headers: authHeaders(),
      body: { ...folderTarget, secretPath: `${folderTarget.secretPath}/` }
    });
    expect(deleteRes.statusCode).toBe(200);
    expect(deleteRes.json().folderAccess.id).toBe(created.id);
  });

  test("grants and revokes access on the root folder", async () => {
    const createRes = await testServer.inject({
      method: "POST",
      url: folderAccessUrl(),
      headers: authHeaders(),
      body: { ...folderTarget, secretPath: "/", permission: SecretFolderRole.Read }
    });
    expect(createRes.statusCode).toBe(200);
    expect(createRes.json().folderAccess.secretPath).toBe("/");

    const deleteRes = await testServer.inject({
      method: "DELETE",
      url: folderAccessUrl(),
      headers: authHeaders(),
      body: { ...folderTarget, secretPath: "/" }
    });
    expect(deleteRes.statusCode).toBe(200);
  });

  test("rejects granting to or updating a project admin", async () => {
    const createRes = await testServer.inject({
      method: "POST",
      url: folderAccessUrl(adminUserId),
      headers: authHeaders(),
      body: { ...folderTarget, permission: SecretFolderRole.Read }
    });
    expect(createRes.statusCode).toBe(400);
    expect(createRes.json().message).toContain("project admin role");

    const patchRes = await testServer.inject({
      method: "PATCH",
      url: folderAccessUrl(adminUserId),
      headers: authHeaders(),
      body: { ...folderTarget, permission: SecretFolderRole.Edit }
    });
    expect(patchRes.statusCode).toBe(400);
    expect(patchRes.json().message).toContain("project admin role");
  });

  test("still allows revoking a grant whose holder became a project admin", async () => {
    const createRes = await testServer.inject({
      method: "POST",
      url: folderAccessUrl(),
      headers: authHeaders(),
      body: { ...folderTarget, permission: SecretFolderRole.Read }
    });
    expect(createRes.statusCode).toBe(200);

    await testDb(TableName.MembershipRole)
      .where({ membershipId: memberProjectMembershipId })
      .update({ role: ProjectMembershipRole.Admin });

    try {
      const patchRes = await testServer.inject({
        method: "PATCH",
        url: folderAccessUrl(),
        headers: authHeaders(),
        body: { ...folderTarget, permission: SecretFolderRole.Edit }
      });
      expect(patchRes.statusCode).toBe(400);

      const deleteRes = await testServer.inject({
        method: "DELETE",
        url: folderAccessUrl(),
        headers: authHeaders(),
        body: { ...folderTarget }
      });
      expect(deleteRes.statusCode).toBe(200);
    } finally {
      await testDb(TableName.MembershipRole)
        .where({ membershipId: memberProjectMembershipId })
        .update({ role: ProjectMembershipRole.Member });
    }
  });

  describe("roster", () => {
    const listUsers = async (
      query = ""
    ): Promise<{
      users: {
        userId: string;
        username: string;
        membershipId: string | null;
        folderRBACAccess: Record<string, unknown> | null;
      }[];
      totalCount: number;
    }> => {
      const res = await testServer.inject({
        method: "GET",
        url: folderAccessUsersUrl(query),
        headers: authHeaders()
      });
      expect(res.statusCode).toBe(200);
      return res.json();
    };

    test("lists project users without a grant as folderRBACAccess null", async () => {
      const { users, totalCount } = await listUsers();

      expect(totalCount).toBeGreaterThan(0);
      const member = users.find((user) => user.userId === memberUserId);
      expect(member).toBeDefined();
      expect(member!.folderRBACAccess).toBeNull();
      expect(member).not.toHaveProperty("roles");
      expect(member!.membershipId).toBe(memberProjectMembershipId);
    });

    test("excludes project admins from the roster", async () => {
      const { users } = await listUsers("&limit=100");
      expect(users.map((user) => user.userId)).not.toContain(adminUserId);
    });

    test("annotates the granted user and clears the annotation on revoke", async () => {
      const createRes = await testServer.inject({
        method: "POST",
        url: folderAccessUrl(),
        headers: authHeaders(),
        body: { ...folderTarget, permission: SecretFolderRole.Manage }
      });
      expect(createRes.statusCode).toBe(200);

      const { users } = await listUsers();
      const granted = users.find((user) => user.userId === memberUserId);
      expect(granted!.folderRBACAccess).toEqual(
        expect.objectContaining({
          projectId,
          folderId: folder.id,
          permission: SecretFolderRole.Manage,
          environment: seedData1.environment.slug,
          secretPath: "/user-folder-access",
          isTemporary: false
        })
      );
      expect(granted!.folderRBACAccess).not.toHaveProperty("name");
      expect(granted!.folderRBACAccess).not.toHaveProperty("permissions");

      const deleteRes = await testServer.inject({
        method: "DELETE",
        url: folderAccessUrl(),
        headers: authHeaders(),
        body: { ...folderTarget }
      });
      expect(deleteRes.statusCode).toBe(200);

      const { users: afterRevoke } = await listUsers();
      const revoked = afterRevoke.find((user) => user.userId === memberUserId);
      expect(revoked).toBeDefined();
      expect(revoked!.folderRBACAccess).toBeNull();
    });

    test("keeps totalCount stable across pages and past the end", async () => {
      const { totalCount } = await listUsers();

      const firstPage = await listUsers("&limit=1&offset=0");
      expect(firstPage.users).toHaveLength(Math.min(1, totalCount));
      expect(firstPage.totalCount).toBe(totalCount);

      const pastTheEnd = await listUsers(`&limit=1&offset=${totalCount + 10}`);
      expect(pastTheEnd.users).toEqual([]);
      expect(pastTheEnd.totalCount).toBe(totalCount);
    });

    test("filters by search", async () => {
      const matching = await listUsers(`&search=${encodeURIComponent(memberEmail)}`);
      expect(matching.users.map((user) => user.userId)).toContain(memberUserId);

      // the seed admin cannot be reached even by an exact search
      const adminSearch = await listUsers(`&search=${encodeURIComponent(seedData1.email)}`);
      expect(adminSearch.users).toEqual([]);
      expect(adminSearch.totalCount).toBe(0);

      const nonMatching = await listUsers("&search=zzz-no-such-member");
      expect(nonMatching.users).toEqual([]);
      expect(nonMatching.totalCount).toBe(0);
    });

    test("rejects an unknown secret path", async () => {
      const res = await testServer.inject({
        method: "GET",
        url: folderAccessUsersUrl("", { ...folderTarget, secretPath: "/no-such-folder" }),
        headers: authHeaders()
      });
      expect(res.statusCode).toBe(404);
    });

    test("rejects an unknown environment", async () => {
      const res = await testServer.inject({
        method: "GET",
        url: folderAccessUsersUrl("", { ...folderTarget, environmentSlug: "no-such-env" }),
        headers: authHeaders()
      });
      expect(res.statusCode).toBe(404);
    });

    test("rejects an out-of-range limit", async () => {
      const res = await testServer.inject({
        method: "GET",
        url: folderAccessUsersUrl("&limit=500"),
        headers: authHeaders()
      });
      expect(res.statusCode).toBe(422);
    });

    describe("group-derived users", () => {
      let groupUserId: string;
      let groupId: string;
      let secondGroupId: string;

      const createGroupInProject = async (slug: string, projectRole: ProjectMembershipRole) => {
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
            role: scope === AccessScope.Project ? projectRole : OrgMembershipRole.Member
          });
        }

        return group.id;
      };

      const createOrgOnlyUser = async () => {
        const username = `group-only-${alphaNumericNanoId(8)}@example.com`;
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

      beforeAll(async () => {
        // org membership only; the project is reached purely through the group
        groupUserId = await createOrgOnlyUser();

        groupId = await createGroupInProject(
          `folder-access-grp-${alphaNumericNanoId(8)}`.toLowerCase(),
          ProjectMembershipRole.Member
        );
        secondGroupId = await createGroupInProject(
          `folder-access-grp2-${alphaNumericNanoId(8)}`.toLowerCase(),
          ProjectMembershipRole.Member
        );

        // the new user reaches the project through two groups; the member user is both a direct
        // member and a group member
        await testDb(TableName.UserGroupMembership).insert([
          { userId: groupUserId, groupId },
          { userId: groupUserId, groupId: secondGroupId },
          { userId: memberUserId, groupId }
        ]);
      });

      afterAll(async () => {
        await testDb(TableName.UserGroupMembership).whereIn("groupId", [groupId, secondGroupId]).del();
        await testDb(TableName.Membership).whereIn("actorGroupId", [groupId, secondGroupId]).del();
        await testDb(TableName.Groups).whereIn("id", [groupId, secondGroupId]).del();
        await deleteProjectUser(groupUserId);
      });

      test("lists a user whose only project access is a group", async () => {
        const { users } = await listUsers();
        const groupUser = users.find((user) => user.userId === groupUserId);

        expect(groupUser).toBeDefined();
        expect(groupUser!.folderRBACAccess).toBeNull();
        expect(groupUser!.membershipId).toBeNull();
      });

      test("counts an actor once however many memberships reach them", async () => {
        const { users, totalCount } = await listUsers("&limit=100");

        // groupUserId is in two groups, memberUserId is direct + in a group
        expect(users.filter((user) => user.userId === groupUserId)).toHaveLength(1);
        expect(users.filter((user) => user.userId === memberUserId)).toHaveLength(1);
        expect(totalCount).toBe(users.length);
        expect(new Set(users.map((user) => user.userId)).size).toBe(users.length);
      });

      test("grants folder access to a group-derived user and shows it on the roster", async () => {
        const grantUrl = folderAccessUrl(groupUserId);

        const createRes = await testServer.inject({
          method: "POST",
          url: grantUrl,
          headers: authHeaders(),
          body: { ...folderTarget, permission: SecretFolderRole.Read }
        });
        expect(createRes.statusCode).toBe(200);

        const { users } = await listUsers("&limit=100");
        const granted = users.find((user) => user.userId === groupUserId);
        expect(granted!.folderRBACAccess).toEqual(
          expect.objectContaining({ folderId: folder.id, permission: SecretFolderRole.Read })
        );

        const deleteRes = await testServer.inject({
          method: "DELETE",
          url: grantUrl,
          headers: authHeaders(),
          body: { ...folderTarget }
        });
        expect(deleteRes.statusCode).toBe(200);
      });

      test("finds a group-derived user by search", async () => {
        const { users } = await listUsers(`&search=group-only`);
        expect(users.map((user) => user.userId)).toContain(groupUserId);
      });

      describe("group-conferred admins", () => {
        let adminGroupId: string;
        let groupAdminUserId: string;

        beforeAll(async () => {
          groupAdminUserId = await createOrgOnlyUser();
          adminGroupId = await createGroupInProject(
            `folder-access-admin-grp-${alphaNumericNanoId(8)}`.toLowerCase(),
            ProjectMembershipRole.Admin
          );
          await testDb(TableName.UserGroupMembership).insert({ userId: groupAdminUserId, groupId: adminGroupId });
        });

        afterAll(async () => {
          await testDb(TableName.UserGroupMembership).where({ groupId: adminGroupId }).del();
          await testDb(TableName.Membership).where({ actorGroupId: adminGroupId }).del();
          await testDb(TableName.Groups).where({ id: adminGroupId }).del();
          await deleteProjectUser(groupAdminUserId);
        });

        test("excludes a user whose admin role comes from a group", async () => {
          const { users } = await listUsers("&limit=100");
          expect(users.map((user) => user.userId)).not.toContain(groupAdminUserId);
        });

        test("rejects granting to a user whose admin role comes from a group", async () => {
          const res = await testServer.inject({
            method: "POST",
            url: folderAccessUrl(groupAdminUserId),
            headers: authHeaders(),
            body: { ...folderTarget, permission: SecretFolderRole.Read }
          });
          expect(res.statusCode).toBe(400);
          expect(res.json().message).toContain("project admin role");
        });
      });
    });
  });
});
