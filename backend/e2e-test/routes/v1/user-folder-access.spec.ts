import { randomUUID } from "node:crypto";

import jwt from "jsonwebtoken";

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
import { removeUsersFromGroupByUserIds } from "@app/ee/services/group/group-fns";
import { reapDeletedGroupFolderGrants } from "@app/ee/services/group/group-folder-grant-fns";
import { identityGroupMembershipDALFactory } from "@app/ee/services/group/identity-group-membership-dal";
import { userGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";
import { KeyStorePrefixes } from "@app/keystore/keystore";
import { getConfig, initEnvConfig } from "@app/lib/config/env";
import { initLogger, logger } from "@app/lib/logger";
import { ms } from "@app/lib/ms";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { additionalPrivilegeDALFactory } from "@app/services/additional-privilege/additional-privilege-dal";
import { alertChannelRecipientDALFactory } from "@app/services/alert/alert-channel-recipient-dal";
import { ActorType, AuthMethod, AuthTokenType } from "@app/services/auth/auth-type";
import { membershipGroupDALFactory } from "@app/services/membership-group/membership-group-dal";
import { projectKeyDALFactory } from "@app/services/project-key/project-key-dal";
import { userDALFactory } from "@app/services/user/user-dal";

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

  test("keeps the full-access role permanent on create and on every update path", async () => {
    const temporaryType = {
      isTemporary: true,
      temporaryMode: TemporaryPermissionMode.Relative,
      temporaryRange: "1h",
      temporaryAccessStartTime: new Date().toISOString()
    };

    const createRes = await testServer.inject({
      method: "POST",
      url: folderAccessUrl(),
      headers: authHeaders(),
      body: { ...folderTarget, permission: SecretFolderRole.FullAccess, type: temporaryType }
    });
    expect(createRes.statusCode).toBe(400);
    expect(createRes.json().message).toContain("cannot be temporary");

    const permanentRes = await testServer.inject({
      method: "POST",
      url: folderAccessUrl(),
      headers: authHeaders(),
      body: { ...folderTarget, permission: SecretFolderRole.FullAccess }
    });
    expect(permanentRes.statusCode).toBe(200);
    expect(permanentRes.json().folderAccess.isTemporary).toBe(false);

    try {
      const addExpiryRes = await testServer.inject({
        method: "PATCH",
        url: folderAccessUrl(),
        headers: authHeaders(),
        body: { ...folderTarget, type: temporaryType }
      });
      expect(addExpiryRes.statusCode).toBe(400);
      expect(addExpiryRes.json().message).toContain("cannot be temporary");

      const loweredRes = await testServer.inject({
        method: "PATCH",
        url: folderAccessUrl(),
        headers: authHeaders(),
        body: { ...folderTarget, permission: SecretFolderRole.Manage, type: temporaryType }
      });
      expect(loweredRes.statusCode).toBe(200);
      expect(loweredRes.json().folderAccess).toEqual(
        expect.objectContaining({ permission: SecretFolderRole.Manage, isTemporary: true })
      );

      const promoteRes = await testServer.inject({
        method: "PATCH",
        url: folderAccessUrl(),
        headers: authHeaders(),
        body: { ...folderTarget, permission: SecretFolderRole.FullAccess }
      });
      expect(promoteRes.statusCode).toBe(400);
      expect(promoteRes.json().message).toContain("cannot be temporary");

      const promotePermanentRes = await testServer.inject({
        method: "PATCH",
        url: folderAccessUrl(),
        headers: authHeaders(),
        body: { ...folderTarget, permission: SecretFolderRole.FullAccess, type: { isTemporary: false } }
      });
      expect(promotePermanentRes.statusCode).toBe(200);
      expect(promotePermanentRes.json().folderAccess).toEqual(
        expect.objectContaining({ permission: SecretFolderRole.FullAccess, isTemporary: false })
      );
    } finally {
      await testServer.inject({
        method: "DELETE",
        url: folderAccessUrl(),
        headers: authHeaders(),
        body: { ...folderTarget }
      });
    }
  });

  describe("folder access list", () => {
    type TFolderAccessUser = {
      userId: string;
      username: string;
      membership: {
        id: string | null;
        isProjectAdmin: boolean;
        roles: { id: string | null; slug: string; name: string }[];
      };
      folderRBACAccess: Record<string, unknown> | null;
    };
    const memberRole = { id: null, slug: ProjectMembershipRole.Member, name: "Member" };

    const listUsers = async (
      query = ""
    ): Promise<{
      users: TFolderAccessUser[];
      usersWithoutAccess: TFolderAccessUser[];
      totalCount: number;
    }> => {
      // the folder access list is cached behind a 20s marker; tests mutate memberships and list right away
      const cached = (
        await Promise.all([
          testRedis.keys(KeyStorePrefixes.ProjectFolderAccessMarker(projectId, folder.id, ActorType.USER, "*")),
          testRedis.keys(KeyStorePrefixes.ProjectFolderAccessData(projectId, folder.id, ActorType.USER, "*"))
        ])
      ).flat();
      if (cached.length) await testRedis.del(...cached);
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
      expect(member!.membership).toEqual({
        id: memberProjectMembershipId,
        isProjectAdmin: false,
        roles: [memberRole]
      });
    });

    test("lists project admins as flagged, non-grantable entries", async () => {
      const { users, usersWithoutAccess } = await listUsers("&limit=100");
      const admin = users.find((user) => user.userId === adminUserId);
      expect(admin).toBeDefined();
      expect(admin!.membership.isProjectAdmin).toBe(true);
      // never a candidate: that list is what the grant picker offers, and granting to an admin 400s
      expect(usersWithoutAccess.map((user) => user.userId)).not.toContain(adminUserId);
    });

    test("lists users without a granting role separately until they receive a grant", async () => {
      const noAccess = await createProjectUser(ProjectMembershipRole.NoAccess);
      try {
        const before = await listUsers("&limit=100");
        expect(before.users.map((user) => user.userId)).not.toContain(noAccess.userId);
        const excluded = before.usersWithoutAccess.find((user) => user.userId === noAccess.userId);
        expect(excluded).toBeDefined();
        expect(excluded!.folderRBACAccess).toBeNull();
        expect(excluded!.membership).toEqual({
          id: noAccess.projectMembershipId,
          isProjectAdmin: false,
          roles: [{ id: null, slug: ProjectMembershipRole.NoAccess, name: "No Access" }]
        });
        expect(before.usersWithoutAccess.length).toBeGreaterThan(0);

        const createRes = await testServer.inject({
          method: "POST",
          url: folderAccessUrl(noAccess.userId),
          headers: authHeaders(),
          body: { ...folderTarget, permission: SecretFolderRole.Read }
        });
        expect(createRes.statusCode).toBe(200);

        const after = await listUsers("&limit=100");
        const granted = after.users.find((user) => user.userId === noAccess.userId);
        expect(granted).toBeDefined();
        expect(granted!.membership.roles).toEqual([]);
        expect(granted!.folderRBACAccess).toEqual(expect.objectContaining({ permission: SecretFolderRole.Read }));
        expect(after.usersWithoutAccess.map((user) => user.userId)).not.toContain(noAccess.userId);
      } finally {
        await deleteProjectUser(noAccess.userId);
      }
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

      // the page is one slice of the roster, then split into the two lists
      const firstPage = await listUsers("&limit=1&offset=0");
      expect(firstPage.users.length + firstPage.usersWithoutAccess.length).toBe(Math.min(1, totalCount));
      expect(firstPage.totalCount).toBe(totalCount);

      const pastTheEnd = await listUsers(`&limit=1&offset=${totalCount + 10}`);
      expect(pastTheEnd.users).toEqual([]);
      expect(pastTheEnd.usersWithoutAccess).toEqual([]);
      expect(pastTheEnd.totalCount).toBe(totalCount);
    });

    test("walks the whole list across pages without repeats or omissions", async () => {
      const { totalCount } = await listUsers();
      const seen: string[] = [];

      for (let offset = 0; offset < totalCount; offset += 1) {
        // eslint-disable-next-line no-await-in-loop
        const page = await listUsers(`&limit=1&offset=${offset}`);
        seen.push(...[...page.users, ...page.usersWithoutAccess].map((user) => user.userId));
      }

      expect(seen).toHaveLength(totalCount);
      expect(new Set(seen).size).toBe(totalCount);
    });

    test("filters by search", async () => {
      const matching = await listUsers(`&search=${encodeURIComponent(memberEmail)}`);
      expect(matching.users.map((user) => user.userId)).toContain(memberUserId);

      const adminSearch = await listUsers(`&search=${encodeURIComponent(seedData1.email)}`);
      expect(adminSearch.users.map((user) => user.userId)).toContain(adminUserId);

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
        // both groups carry the member role, so it is reported once
        expect(groupUser!.membership).toEqual({ id: null, isProjectAdmin: false, roles: [memberRole] });
      });

      test("counts an actor once however many memberships reach them", async () => {
        const { users, usersWithoutAccess, totalCount } = await listUsers("&limit=100");
        const all = [...users, ...usersWithoutAccess];

        // groupUserId is in two groups, memberUserId is direct + in a group
        expect(users.filter((user) => user.userId === groupUserId)).toHaveLength(1);
        expect(users.filter((user) => user.userId === memberUserId)).toHaveLength(1);
        expect(totalCount).toBe(all.length);
        expect(new Set(all.map((user) => user.userId)).size).toBe(all.length);
      });

      test("grants folder access to a group-derived user and shows it in the folder access list", async () => {
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

        test("flags a user whose admin role comes from a group", async () => {
          const { users, usersWithoutAccess } = await listUsers("&limit=100");
          const groupAdmin = users.find((user) => user.userId === groupAdminUserId);
          expect(groupAdmin).toBeDefined();
          expect(groupAdmin!.membership.isProjectAdmin).toBe(true);
          expect(usersWithoutAccess.map((user) => user.userId)).not.toContain(groupAdminUserId);
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

  describe("callers without project access", () => {
    const outsiderSessionId = randomUUID();
    let outsiderUserId: string;
    let outsiderJwt: string;

    const outsiderHeaders = () => ({ authorization: `Bearer ${outsiderJwt}` });

    beforeAll(async () => {
      initLogger();
      await initEnvConfig(testHsmService, testKmsRootConfigDAL, testSuperAdminDAL, logger);

      const username = `folder-access-outsider-${alphaNumericNanoId(8)}@example.com`;
      const [user] = await testDb(TableName.Users)
        .insert({ username, email: username, isGhost: false, isAccepted: true, authMethods: [AuthMethod.EMAIL] })
        .returning("*");
      outsiderUserId = user.id;

      const [orgMembership] = await testDb(TableName.Membership)
        .insert({
          scope: AccessScope.Organization,
          scopeOrgId: orgId,
          actorUserId: outsiderUserId,
          status: OrgMembershipStatus.Accepted,
          isActive: true
        })
        .returning("*");
      await testDb(TableName.MembershipRole).insert({
        membershipId: orgMembership.id,
        role: OrgMembershipRole.Member
      });

      await testDb(TableName.AuthTokenSession).insert({
        id: outsiderSessionId,
        userId: outsiderUserId,
        ip: "127.0.0.1",
        userAgent: "e2e-folder-access",
        accessVersion: 1,
        refreshVersion: 1,
        lastUsed: new Date()
      } as never);

      outsiderJwt = jwt.sign(
        {
          authTokenType: AuthTokenType.ACCESS_TOKEN,
          userId: outsiderUserId,
          tokenVersionId: outsiderSessionId,
          authMethod: AuthMethod.EMAIL,
          organizationId: orgId,
          accessVersion: 1
        },
        getConfig().AUTH_SECRET,
        { expiresIn: 3600 }
      );
    });

    afterAll(async () => {
      await testDb(TableName.AuthTokenSession).where({ id: outsiderSessionId }).del();
      await deleteProjectUser(outsiderUserId);
    });

    // the permission error must come before folder resolution, so an existing and a nonexistent
    // path are indistinguishable to a caller without project access
    test("does not reveal whether a folder path exists", async () => {
      const existingPathRes = await testServer.inject({
        method: "GET",
        url: folderAccessUsersUrl(),
        headers: outsiderHeaders()
      });
      expect(existingPathRes.statusCode).toBe(403);

      const missingPathRes = await testServer.inject({
        method: "GET",
        url: folderAccessUsersUrl("", { ...folderTarget, secretPath: "/no-such-folder" }),
        headers: outsiderHeaders()
      });
      expect(missingPathRes.statusCode).toBe(403);

      const missingEnvRes = await testServer.inject({
        method: "GET",
        url: folderAccessUsersUrl("", { ...folderTarget, environmentSlug: "no-such-env" }),
        headers: outsiderHeaders()
      });
      expect(missingEnvRes.statusCode).toBe(403);

      const createRes = await testServer.inject({
        method: "POST",
        url: folderAccessUrl(),
        headers: outsiderHeaders(),
        body: { ...folderTarget, secretPath: "/no-such-folder", permission: SecretFolderRole.Read }
      });
      expect(createRes.statusCode).toBe(403);
    });

    test("cannot list a user's folder grants", async () => {
      const res = await testServer.inject({
        method: "GET",
        url: folderAccessUrl(),
        headers: outsiderHeaders()
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe("actor grant listing", () => {
    const listTarget = { environmentSlug: seedData1.environment.slug, secretPath: "/user-folder-access-list" };
    let listFolder: { id: string; name: string };
    let listUserId: string;

    beforeAll(async () => {
      listFolder = await createFolder({ path: "/", name: "user-folder-access-list" });
      const listUser = await createProjectUser(ProjectMembershipRole.Member);
      listUserId = listUser.userId;
    });

    afterAll(async () => {
      await deleteFolder({ path: "/", id: listFolder.id });
      await deleteProjectUser(listUserId);
    });

    test("returns an empty list for a user with no grants", async () => {
      const res = await testServer.inject({
        method: "GET",
        url: folderAccessUrl(listUserId),
        headers: authHeaders()
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ folderAccess: [] });
    });

    test("lists every folder grant for the user across the project, sorted by path", async () => {
      const temporaryAccessStartTime = new Date().toISOString();
      const firstRes = await testServer.inject({
        method: "POST",
        url: folderAccessUrl(listUserId),
        headers: authHeaders(),
        body: { ...folderTarget, permission: SecretFolderRole.Read }
      });
      expect(firstRes.statusCode).toBe(200);

      const secondRes = await testServer.inject({
        method: "POST",
        url: folderAccessUrl(listUserId),
        headers: authHeaders(),
        body: {
          ...listTarget,
          permission: SecretFolderRole.Edit,
          type: {
            isTemporary: true,
            temporaryMode: TemporaryPermissionMode.Relative,
            temporaryRange: "30m",
            temporaryAccessStartTime
          }
        }
      });
      expect(secondRes.statusCode).toBe(200);

      try {
        const listRes = await testServer.inject({
          method: "GET",
          url: folderAccessUrl(listUserId),
          headers: authHeaders()
        });
        expect(listRes.statusCode).toBe(200);
        const { folderAccess } = listRes.json();
        expect(folderAccess).toHaveLength(2);
        expect(folderAccess[0]).toEqual(
          expect.objectContaining({
            userId: listUserId,
            projectId,
            permission: SecretFolderRole.Read,
            environment: seedData1.environment.slug,
            secretPath: folderTarget.secretPath,
            isTemporary: false,
            temporaryRange: null
          })
        );
        expect(folderAccess[1]).toEqual(
          expect.objectContaining({
            userId: listUserId,
            permission: SecretFolderRole.Edit,
            secretPath: listTarget.secretPath,
            isTemporary: true,
            temporaryMode: TemporaryPermissionMode.Relative,
            temporaryRange: "30m"
          })
        );
        expect(new Date(folderAccess[1].temporaryAccessStartTime).toISOString()).toBe(temporaryAccessStartTime);
        expect(folderAccess[0]).not.toHaveProperty("name");
        expect(folderAccess[0]).not.toHaveProperty("permissions");
      } finally {
        await testServer.inject({
          method: "DELETE",
          url: folderAccessUrl(listUserId),
          headers: authHeaders(),
          body: { ...folderTarget }
        });
        await testServer.inject({
          method: "DELETE",
          url: folderAccessUrl(listUserId),
          headers: authHeaders(),
          body: { ...listTarget }
        });
      }
    });
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
        projectKeyDAL: projectKeyDALFactory(testDb),
        additionalPrivilegeDAL: additionalPrivilegeDALFactory(testDb),
        alertChannelRecipientDAL: alertChannelRecipientDALFactory(testDb)
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
