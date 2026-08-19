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
const userId = seedData1.id;

const folderAccessUrl = (folderId?: string) =>
  `/api/v1/user-project-additional-privilege/projects/${projectId}/users/${userId}/folder-access${
    folderId ? `/${folderId}` : ""
  }`;

const folderAccessUsersUrl = (folderId: string, query = "") =>
  `/api/v1/user-project-additional-privilege/projects/${projectId}/folder-access/${folderId}/users${query}`;

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

  describe("roster", () => {
    const listUsers = async (
      query = ""
    ): Promise<{
      users: { userId: string; username: string; folderAccess: Record<string, unknown> | null }[];
      totalCount: number;
    }> => {
      const res = await testServer.inject({
        method: "GET",
        url: folderAccessUsersUrl(folder.id, query),
        headers: authHeaders()
      });
      expect(res.statusCode).toBe(200);
      return res.json();
    };

    test("lists project users without a grant as folderAccess null", async () => {
      const { users, totalCount } = await listUsers();

      expect(totalCount).toBeGreaterThan(0);
      const seedUser = users.find((user) => user.userId === userId);
      expect(seedUser).toBeDefined();
      expect(seedUser!.folderAccess).toBeNull();
      expect(seedUser).not.toHaveProperty("roles");
      expect(seedUser).not.toHaveProperty("membershipId");
    });

    test("annotates the granted user and clears the annotation on revoke", async () => {
      const createRes = await testServer.inject({
        method: "POST",
        url: folderAccessUrl(folder.id),
        headers: authHeaders(),
        body: { permission: SecretFolderRole.Manage }
      });
      expect(createRes.statusCode).toBe(200);

      const { users } = await listUsers();
      const granted = users.find((user) => user.userId === userId);
      expect(granted!.folderAccess).toEqual(
        expect.objectContaining({
          projectId,
          folderId: folder.id,
          permission: SecretFolderRole.Manage,
          environment: seedData1.environment.slug,
          secretPath: "/user-folder-access",
          isTemporary: false
        })
      );
      expect(granted!.folderAccess).not.toHaveProperty("name");
      expect(granted!.folderAccess).not.toHaveProperty("permissions");

      const deleteRes = await testServer.inject({
        method: "DELETE",
        url: folderAccessUrl(folder.id),
        headers: authHeaders()
      });
      expect(deleteRes.statusCode).toBe(200);

      const { users: afterRevoke } = await listUsers();
      const revoked = afterRevoke.find((user) => user.userId === userId);
      expect(revoked).toBeDefined();
      expect(revoked!.folderAccess).toBeNull();
    });

    test("keeps totalCount stable across pages and past the end", async () => {
      const { totalCount } = await listUsers();

      const firstPage = await listUsers("?limit=1&offset=0");
      expect(firstPage.users).toHaveLength(Math.min(1, totalCount));
      expect(firstPage.totalCount).toBe(totalCount);

      const pastTheEnd = await listUsers(`?limit=1&offset=${totalCount + 10}`);
      expect(pastTheEnd.users).toEqual([]);
      expect(pastTheEnd.totalCount).toBe(totalCount);
    });

    test("filters by search", async () => {
      const matching = await listUsers(`?search=${encodeURIComponent(seedData1.email)}`);
      expect(matching.users.map((user) => user.userId)).toContain(userId);

      const nonMatching = await listUsers("?search=zzz-no-such-member");
      expect(nonMatching.users).toEqual([]);
      expect(nonMatching.totalCount).toBe(0);
    });

    test("rejects a folder outside the project", async () => {
      const outsideRes = await testServer.inject({
        method: "GET",
        url: folderAccessUsersUrl("00000000-0000-0000-0000-000000000000"),
        headers: authHeaders()
      });
      expect(outsideRes.statusCode).toBe(404);
    });

    test("rejects an out-of-range limit", async () => {
      const res = await testServer.inject({
        method: "GET",
        url: folderAccessUsersUrl(folder.id, "?limit=500"),
        headers: authHeaders()
      });
      expect(res.statusCode).toBe(422);
    });

    describe("group-derived users", () => {
      const orgId = seedData1.organization.id;
      let groupUserId: string;
      let groupId: string;
      let secondGroupId: string;

      const createGroupInProject = async (slug: string) => {
        const [group] = await testDb(TableName.Groups)
          .insert({ orgId, name: slug, slug })
          .returning("*");

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

        return group.id as string;
      };

      beforeAll(async () => {
        const username = `group-only-${alphaNumericNanoId(8)}@example.com`;
        const [user] = await testDb(TableName.Users)
          .insert({ username, email: username, isGhost: false, isAccepted: true, authMethods: [AuthMethod.EMAIL] })
          .returning("*");
        groupUserId = user.id as string;

        // org membership only; the project is reached purely through the group
        const [orgMembership] = await testDb(TableName.Membership)
          .insert({
            scope: AccessScope.Organization,
            scopeOrgId: orgId,
            actorUserId: groupUserId,
            status: OrgMembershipStatus.Accepted,
            isActive: true
          })
          .returning("*");
        await testDb(TableName.MembershipRole).insert({
          membershipId: orgMembership.id,
          role: OrgMembershipRole.Member
        });

        groupId = await createGroupInProject(`folder-access-grp-${alphaNumericNanoId(8)}`.toLowerCase());
        secondGroupId = await createGroupInProject(`folder-access-grp2-${alphaNumericNanoId(8)}`.toLowerCase());

        // the new user reaches the project through two groups; the seed admin is both a direct
        // member and a group member
        await testDb(TableName.UserGroupMembership).insert([
          { userId: groupUserId, groupId },
          { userId: groupUserId, groupId: secondGroupId },
          { userId, groupId }
        ]);
      });

      afterAll(async () => {
        await testDb(TableName.UserGroupMembership)
          .whereIn("groupId", [groupId, secondGroupId])
          .del();
        await testDb(TableName.Membership).whereIn("actorGroupId", [groupId, secondGroupId]).del();
        await testDb(TableName.Groups).whereIn("id", [groupId, secondGroupId]).del();
        await testDb(TableName.Membership).where({ actorUserId: groupUserId }).del();
        await testDb(TableName.Users).where({ id: groupUserId }).del();
      });

      test("lists a user whose only project access is a group", async () => {
        const { users } = await listUsers();
        const groupUser = users.find((user) => user.userId === groupUserId);

        expect(groupUser).toBeDefined();
        expect(groupUser!.folderAccess).toBeNull();
      });

      test("counts an actor once however many memberships reach them", async () => {
        const { users, totalCount } = await listUsers("?limit=100");

        // groupUserId is in two groups, userId is direct + in a group
        expect(users.filter((user) => user.userId === groupUserId)).toHaveLength(1);
        expect(users.filter((user) => user.userId === userId)).toHaveLength(1);
        expect(totalCount).toBe(users.length);
        expect(new Set(users.map((user) => user.userId)).size).toBe(users.length);
      });

      test("grants folder access to a group-derived user and shows it on the roster", async () => {
        const grantUrl = `/api/v1/user-project-additional-privilege/projects/${projectId}/users/${groupUserId}/folder-access/${folder.id}`;

        const createRes = await testServer.inject({
          method: "POST",
          url: grantUrl,
          headers: authHeaders(),
          body: { permission: SecretFolderRole.Read }
        });
        expect(createRes.statusCode).toBe(200);

        const { users } = await listUsers("?limit=100");
        const granted = users.find((user) => user.userId === groupUserId);
        expect(granted!.folderAccess).toEqual(
          expect.objectContaining({ folderId: folder.id, permission: SecretFolderRole.Read })
        );

        const deleteRes = await testServer.inject({ method: "DELETE", url: grantUrl, headers: authHeaders() });
        expect(deleteRes.statusCode).toBe(200);
      });

      test("finds a group-derived user by search", async () => {
        const { users } = await listUsers(`?search=group-only`);
        expect(users.map((user) => user.userId)).toContain(groupUserId);
      });
    });
  });
});
