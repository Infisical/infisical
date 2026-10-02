import {
  AccessScope,
  OrgMembershipRole,
  ProjectMembershipRole,
  ProjectType,
  SecretFolderRole,
  TableName,
  TemporaryPermissionMode
} from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { removeIdentitiesFromGroup } from "@app/ee/services/group/group-fns";
import { reapDeletedGroupFolderGrants } from "@app/ee/services/group/group-folder-grant-fns";
import { identityGroupMembershipDALFactory } from "@app/ee/services/group/identity-group-membership-dal";
import { userGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";
import { KeyStorePrefixes } from "@app/keystore/keystore";
import { ms } from "@app/lib/ms";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { additionalPrivilegeDALFactory } from "@app/services/additional-privilege/additional-privilege-dal";
import { ActorType } from "@app/services/auth/auth-type";
import { identityDALFactory } from "@app/services/identity/identity-dal";
import { membershipDALFactory } from "@app/services/membership/membership-dal";
import { membershipGroupDALFactory } from "@app/services/membership-group/membership-group-dal";

const projectId = seedData1.project.id;
const orgId = seedData1.organization.id;
// the seed identity is a project admin; admins cannot receive folder grants, so tests grant to a
// dedicated member identity created in beforeAll
const adminIdentityId = seedData1.machineIdentity.id;

let memberIdentityId: string;
let memberIdentityName: string;

const folderPath = "/identity-folder-access";
const folderTarget = { environmentSlug: seedData1.environment.slug, secretPath: folderPath };

const folderAccessUrl = (targetIdentityId?: string) =>
  `/api/v1/projects/${projectId}/memberships/identities/${targetIdentityId ?? memberIdentityId}/secret-folder-access`;

const folderAccessIdentitiesUrl = (query = "") =>
  `/api/v1/projects/${projectId}/memberships/secret-folder-access/identities?environmentSlug=${
    seedData1.environment.slug
  }&secretPath=${encodeURIComponent(folderPath)}${query}`;

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

const createProjectIdentity = async (role: ProjectMembershipRole) => {
  const name = `folder-access-identity-${alphaNumericNanoId(8)}`.toLowerCase();
  const [identity] = await testDb(TableName.Identity).insert({ name, orgId }).returning("*");

  const [orgMembership] = await testDb(TableName.Membership)
    .insert({
      scope: AccessScope.Organization,
      scopeOrgId: orgId,
      actorIdentityId: identity.id
    })
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
  await testDb(TableName.MembershipRole).insert({ membershipId: projectMembership.id, role });

  return { identityId: identity.id, name };
};

const deleteProjectIdentity = async (id: string) => {
  await testDb(TableName.Membership).where({ actorIdentityId: id }).del();
  await testDb(TableName.Identity).where({ id }).del();
};

describe("Identity folder access CRUD", () => {
  let folder: { id: string; name: string };

  beforeAll(async () => {
    folder = await createFolder({ path: "/", name: "identity-folder-access" });
    const member = await createProjectIdentity(ProjectMembershipRole.Member);
    memberIdentityId = member.identityId;
    memberIdentityName = member.name;
  });

  afterAll(async () => {
    await deleteFolder({ path: "/", id: folder.id });
    await deleteProjectIdentity(memberIdentityId);
  });

  test("full lifecycle: create, conflict, get, list, patch, delete", async () => {
    const temporaryAccessStartTime = new Date().toISOString();
    const createRes = await testServer.inject({
      method: "POST",
      url: folderAccessUrl(),
      headers: authHeaders(),
      body: {
        ...folderTarget,
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
        identityId: memberIdentityId,
        permission: SecretFolderRole.Manage,
        environment: seedData1.environment.slug,
        secretPath: "/identity-folder-access",
        isTemporary: true,
        temporaryMode: TemporaryPermissionMode.Relative,
        temporaryRange: "1d"
      })
    );
    expect(new Date(created.temporaryAccessStartTime).toISOString()).toBe(temporaryAccessStartTime);
    expect(
      new Date(created.temporaryAccessEndTime).getTime() - new Date(created.temporaryAccessStartTime).getTime()
    ).toBe(ms("1d"));

    const conflictRes = await testServer.inject({
      method: "POST",
      url: folderAccessUrl(),
      headers: authHeaders(),
      body: { ...folderTarget, permission: SecretFolderRole.Read }
    });
    expect(conflictRes.statusCode).toBe(400);
    expect(conflictRes.json().message).toContain("already has folder access");

    const patchRes = await testServer.inject({
      method: "PATCH",
      url: folderAccessUrl(),
      headers: authHeaders(),
      body: { ...folderTarget, permission: SecretFolderRole.List, type: { isTemporary: false } }
    });
    expect(patchRes.statusCode).toBe(200);
    const patched = patchRes.json().folderAccess;
    expect(patched.permission).toBe(SecretFolderRole.List);
    expect(patched.isTemporary).toBe(false);
    expect(patched.temporaryAccessEndTime).toBeNull();

    const deleteRes = await testServer.inject({
      method: "DELETE",
      url: folderAccessUrl(),
      headers: authHeaders(),
      body: folderTarget
    });
    expect(deleteRes.statusCode).toBe(200);
    expect(deleteRes.json().folderAccess.id).toBe(created.id);

    expect(await testDb(TableName.AdditionalPrivilege).where({ id: created.id })).toEqual([]);
  });

  test("rejects granting to or updating a project admin identity", async () => {
    const createRes = await testServer.inject({
      method: "POST",
      url: folderAccessUrl(adminIdentityId),
      headers: authHeaders(),
      body: { ...folderTarget, permission: SecretFolderRole.Read }
    });
    expect(createRes.statusCode).toBe(400);
    expect(createRes.json().message).toContain("project admin role");

    const patchRes = await testServer.inject({
      method: "PATCH",
      url: folderAccessUrl(adminIdentityId),
      headers: authHeaders(),
      body: { ...folderTarget, permission: SecretFolderRole.Edit }
    });
    expect(patchRes.statusCode).toBe(400);
    expect(patchRes.json().message).toContain("project admin role");
  });

  test("rejects folder access at an unknown or malformed location", async () => {
    const unknownPathRes = await testServer.inject({
      method: "POST",
      url: folderAccessUrl(),
      headers: authHeaders(),
      body: {
        environmentSlug: seedData1.environment.slug,
        secretPath: "/no-such-folder",
        permission: SecretFolderRole.Read
      }
    });
    expect(unknownPathRes.statusCode).toBe(404);

    const unknownEnvRes = await testServer.inject({
      method: "POST",
      url: folderAccessUrl(),
      headers: authHeaders(),
      body: { environmentSlug: "no-such-env", secretPath: folderPath, permission: SecretFolderRole.Read }
    });
    expect(unknownEnvRes.statusCode).toBe(404);

    const malformedPathRes = await testServer.inject({
      method: "POST",
      url: folderAccessUrl(),
      headers: authHeaders(),
      body: { environmentSlug: seedData1.environment.slug, secretPath: "/bad name!", permission: SecretFolderRole.Read }
    });
    expect(malformedPathRes.statusCode).toBe(400);
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
    type TFolderAccessIdentity = {
      identityId: string;
      name: string;
      membership: {
        id: string | null;
        isProjectAdmin: boolean;
        roles: { id: string | null; slug: string; name: string }[];
      };
      folderRBACAccess: Record<string, unknown> | null;
    };
    const memberRole = { id: null, slug: ProjectMembershipRole.Member, name: "Member" };

    const listIdentities = async (
      query = ""
    ): Promise<{
      identities: TFolderAccessIdentity[];
      identitiesWithoutAccess: TFolderAccessIdentity[];
      totalCount: number;
    }> => {
      // the folder access list is cached behind a 20s marker; tests mutate memberships and list right away
      const cached = (
        await Promise.all([
          testRedis.keys(KeyStorePrefixes.ProjectFolderAccessMarker(projectId, folder.id, ActorType.IDENTITY, "*")),
          testRedis.keys(KeyStorePrefixes.ProjectFolderAccessData(projectId, folder.id, ActorType.IDENTITY, "*"))
        ])
      ).flat();
      if (cached.length) await testRedis.del(...cached);
      const res = await testServer.inject({
        method: "GET",
        url: folderAccessIdentitiesUrl(query),
        headers: authHeaders()
      });
      expect(res.statusCode).toBe(200);
      return res.json();
    };

    test("lists project admin identities as flagged, non-grantable entries", async () => {
      const { identities, identitiesWithoutAccess } = await listIdentities("&limit=100");
      const admin = identities.find((identity) => identity.identityId === adminIdentityId);
      expect(admin).toBeDefined();
      expect(admin!.membership.isProjectAdmin).toBe(true);
      // never a candidate: that list is what the grant picker offers, and granting to an admin 400s
      expect(identitiesWithoutAccess.map((identity) => identity.identityId)).not.toContain(adminIdentityId);
    });

    test("lists identities without a granting role separately until they receive a grant", async () => {
      const noAccess = await createProjectIdentity(ProjectMembershipRole.NoAccess);
      try {
        const before = await listIdentities("&limit=100");
        expect(before.identities.map((identity) => identity.identityId)).not.toContain(noAccess.identityId);
        const excluded = before.identitiesWithoutAccess.find((identity) => identity.identityId === noAccess.identityId);
        expect(excluded).toBeDefined();
        expect(excluded!.folderRBACAccess).toBeNull();
        expect(excluded!.membership.id).toEqual(expect.any(String));
        expect(excluded!.membership.roles).toEqual([
          { id: null, slug: ProjectMembershipRole.NoAccess, name: "No Access" }
        ]);
        expect(before.identitiesWithoutAccess.length).toBeGreaterThan(0);

        const createRes = await testServer.inject({
          method: "POST",
          url: folderAccessUrl(noAccess.identityId),
          headers: authHeaders(),
          body: { ...folderTarget, permission: SecretFolderRole.Read }
        });
        expect(createRes.statusCode).toBe(200);

        const after = await listIdentities("&limit=100");
        const granted = after.identities.find((identity) => identity.identityId === noAccess.identityId);
        expect(granted).toBeDefined();
        expect(granted!.membership.roles).toEqual([]);
        expect(granted!.folderRBACAccess).toEqual(expect.objectContaining({ permission: SecretFolderRole.Read }));
        expect(after.identitiesWithoutAccess.map((identity) => identity.identityId)).not.toContain(noAccess.identityId);
      } finally {
        await deleteProjectIdentity(noAccess.identityId);
      }
    });

    test("lists project identities and annotates only the granted one", async () => {
      const before = await listIdentities();
      expect(before.totalCount).toBeGreaterThan(0);
      const memberBefore = before.identities.find((identity) => identity.identityId === memberIdentityId);
      expect(memberBefore).toBeDefined();
      expect(memberBefore!.folderRBACAccess).toBeNull();
      expect(memberBefore).not.toHaveProperty("roles");
      expect(memberBefore!.membership.id).toEqual(expect.any(String));
      expect(memberBefore!.membership.roles).toEqual([memberRole]);

      const createRes = await testServer.inject({
        method: "POST",
        url: folderAccessUrl(),
        headers: authHeaders(),
        body: { ...folderTarget, permission: SecretFolderRole.Edit }
      });
      expect(createRes.statusCode).toBe(200);

      const after = await listIdentities();
      const granted = after.identities.find((identity) => identity.identityId === memberIdentityId);
      expect(granted!.folderRBACAccess).toEqual(
        expect.objectContaining({
          projectId,
          folderId: folder.id,
          permission: SecretFolderRole.Edit,
          environment: seedData1.environment.slug,
          isTemporary: false
        })
      );
      expect(after.totalCount).toBe(before.totalCount);

      const deleteRes = await testServer.inject({
        method: "DELETE",
        url: folderAccessUrl(),
        headers: authHeaders(),
        body: folderTarget
      });
      expect(deleteRes.statusCode).toBe(200);

      const afterRevoke = await listIdentities();
      expect(
        afterRevoke.identities.find((identity) => identity.identityId === memberIdentityId)!.folderRBACAccess
      ).toBeNull();
    });

    test("filters by search and keeps totalCount stable past the end", async () => {
      const matching = await listIdentities(`&search=${encodeURIComponent(memberIdentityName)}`);
      expect(matching.identities.map((identity) => identity.identityId)).toContain(memberIdentityId);

      const { totalCount } = await listIdentities();

      const pastTheEnd = await listIdentities(`&limit=1&offset=${totalCount + 10}`);
      expect(pastTheEnd.identities).toEqual([]);
      expect(pastTheEnd.totalCount).toBe(totalCount);

      const nonMatching = await listIdentities("&search=zzz-no-such-identity");
      expect(nonMatching.identities).toEqual([]);
      expect(nonMatching.totalCount).toBe(0);
    });

    describe("group-derived identities", () => {
      let groupIdentityId: string;
      let groupId: string;

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

      beforeAll(async () => {
        const [identity] = await testDb(TableName.Identity)
          .insert({ name: `group-only-identity-${alphaNumericNanoId(8)}`, orgId })
          .returning("*");
        groupIdentityId = identity.id;

        groupId = await createGroupInProject(
          `identity-folder-grp-${alphaNumericNanoId(8)}`.toLowerCase(),
          ProjectMembershipRole.Member
        );

        // the new identity reaches the project only through the group; the member identity is both
        // a direct member and a group member
        await testDb(TableName.IdentityGroupMembership).insert([
          { identityId: groupIdentityId, groupId },
          { identityId: memberIdentityId, groupId }
        ]);
      });

      afterAll(async () => {
        await testDb(TableName.IdentityGroupMembership).where({ groupId }).del();
        await testDb(TableName.Membership).where({ actorGroupId: groupId }).del();
        await testDb(TableName.Groups).where({ id: groupId }).del();
        await testDb(TableName.Identity).where({ id: groupIdentityId }).del();
      });

      test("lists an identity whose only project access is a group, once", async () => {
        const { identities, totalCount } = await listIdentities("&limit=100");

        const groupIdentity = identities.find((identity) => identity.identityId === groupIdentityId);
        expect(groupIdentity).toBeDefined();
        expect(groupIdentity!.folderRBACAccess).toBeNull();

        // the member identity is reachable directly and via the group, and must not be duplicated
        expect(identities.filter((identity) => identity.identityId === memberIdentityId)).toHaveLength(1);
        expect(new Set(identities.map((identity) => identity.identityId)).size).toBe(identities.length);
        expect(totalCount).toBe(identities.length);
      });

      test("grants folder access to a group-derived identity and shows it in the folder access list", async () => {
        const grantUrl = folderAccessUrl(groupIdentityId);

        const createRes = await testServer.inject({
          method: "POST",
          url: grantUrl,
          headers: authHeaders(),
          body: { ...folderTarget, permission: SecretFolderRole.Read }
        });
        expect(createRes.statusCode).toBe(200);

        const { identities } = await listIdentities("&limit=100");
        const granted = identities.find((identity) => identity.identityId === groupIdentityId);
        expect(granted!.folderRBACAccess).toEqual(
          expect.objectContaining({ folderId: folder.id, permission: SecretFolderRole.Read })
        );

        const deleteRes = await testServer.inject({
          method: "DELETE",
          url: grantUrl,
          headers: authHeaders(),
          body: folderTarget
        });
        expect(deleteRes.statusCode).toBe(200);
      });

      describe("group-conferred admins", () => {
        let adminGroupId: string;
        let groupAdminIdentityId: string;

        beforeAll(async () => {
          const [identity] = await testDb(TableName.Identity)
            .insert({ name: `group-admin-identity-${alphaNumericNanoId(8)}`, orgId })
            .returning("*");
          groupAdminIdentityId = identity.id;

          adminGroupId = await createGroupInProject(
            `identity-folder-admin-grp-${alphaNumericNanoId(8)}`.toLowerCase(),
            ProjectMembershipRole.Admin
          );
          await testDb(TableName.IdentityGroupMembership).insert({
            identityId: groupAdminIdentityId,
            groupId: adminGroupId
          });
        });

        afterAll(async () => {
          await testDb(TableName.IdentityGroupMembership).where({ groupId: adminGroupId }).del();
          await testDb(TableName.Membership).where({ actorGroupId: adminGroupId }).del();
          await testDb(TableName.Groups).where({ id: adminGroupId }).del();
          await testDb(TableName.Identity).where({ id: groupAdminIdentityId }).del();
        });

        test("flags an identity whose admin role comes from a group", async () => {
          const { identities, identitiesWithoutAccess } = await listIdentities("&limit=100");
          const groupAdmin = identities.find((identity) => identity.identityId === groupAdminIdentityId);
          expect(groupAdmin).toBeDefined();
          expect(groupAdmin!.membership.isProjectAdmin).toBe(true);
          expect(identitiesWithoutAccess.map((identity) => identity.identityId)).not.toContain(groupAdminIdentityId);
        });

        test("rejects granting to an identity whose admin role comes from a group", async () => {
          const res = await testServer.inject({
            method: "POST",
            url: folderAccessUrl(groupAdminIdentityId),
            headers: authHeaders(),
            body: { ...folderTarget, permission: SecretFolderRole.Read }
          });
          expect(res.statusCode).toBe(400);
          expect(res.json().message).toContain("project admin role");
        });
      });
    });
  });

  describe("actor grant listing", () => {
    const listTarget = { environmentSlug: seedData1.environment.slug, secretPath: "/identity-folder-access-list" };
    let listFolder: { id: string; name: string };
    let listIdentityId: string;

    beforeAll(async () => {
      listFolder = await createFolder({ path: "/", name: "identity-folder-access-list" });
      const listIdentity = await createProjectIdentity(ProjectMembershipRole.Member);
      listIdentityId = listIdentity.identityId;
    });

    afterAll(async () => {
      await deleteFolder({ path: "/", id: listFolder.id });
      await deleteProjectIdentity(listIdentityId);
    });

    test("returns an empty list for an identity with no grants", async () => {
      const res = await testServer.inject({
        method: "GET",
        url: folderAccessUrl(listIdentityId),
        headers: authHeaders()
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ folderAccess: [] });
    });

    test("lists every folder grant for the identity across the project, sorted by path", async () => {
      const temporaryAccessStartTime = new Date().toISOString();
      const firstRes = await testServer.inject({
        method: "POST",
        url: folderAccessUrl(listIdentityId),
        headers: authHeaders(),
        body: { ...folderTarget, permission: SecretFolderRole.List }
      });
      expect(firstRes.statusCode).toBe(200);

      const secondRes = await testServer.inject({
        method: "POST",
        url: folderAccessUrl(listIdentityId),
        headers: authHeaders(),
        body: {
          ...listTarget,
          permission: SecretFolderRole.Manage,
          type: {
            isTemporary: true,
            temporaryMode: TemporaryPermissionMode.Relative,
            temporaryRange: "4h",
            temporaryAccessStartTime
          }
        }
      });
      expect(secondRes.statusCode).toBe(200);

      try {
        const listRes = await testServer.inject({
          method: "GET",
          url: folderAccessUrl(listIdentityId),
          headers: authHeaders()
        });
        expect(listRes.statusCode).toBe(200);
        const { folderAccess } = listRes.json();
        expect(folderAccess).toHaveLength(2);
        expect(folderAccess[0]).toEqual(
          expect.objectContaining({
            identityId: listIdentityId,
            projectId,
            permission: SecretFolderRole.List,
            environment: seedData1.environment.slug,
            secretPath: folderTarget.secretPath,
            isTemporary: false,
            temporaryRange: null
          })
        );
        expect(folderAccess[1]).toEqual(
          expect.objectContaining({
            identityId: listIdentityId,
            permission: SecretFolderRole.Manage,
            secretPath: listTarget.secretPath,
            isTemporary: true,
            temporaryMode: TemporaryPermissionMode.Relative,
            temporaryRange: "4h"
          })
        );
        expect(new Date(folderAccess[1].temporaryAccessStartTime).toISOString()).toBe(temporaryAccessStartTime);
      } finally {
        await testServer.inject({
          method: "DELETE",
          url: folderAccessUrl(listIdentityId),
          headers: authHeaders(),
          body: { ...folderTarget }
        });
        await testServer.inject({
          method: "DELETE",
          url: folderAccessUrl(listIdentityId),
          headers: authHeaders(),
          body: { ...listTarget }
        });
      }
    });
  });

  describe("group removal reaps folder grants", () => {
    let reapIdentityId: string;
    let directIdentityId: string;
    let firstGroup: { id: string; name: string; slug: string; orgId: string };
    let secondGroup: { id: string; name: string; slug: string; orgId: string };
    let removalDeps: Omit<
      Parameters<typeof removeIdentitiesFromGroup>[0],
      "group" | "identityIds" | "usageMeteringService"
    >;

    const createProjectGroup = async () => {
      const slug = `identity-folder-reap-grp-${alphaNumericNanoId(8)}`.toLowerCase();
      const [created] = await testDb(TableName.Groups).insert({ orgId, name: slug, slug }).returning("*");

      for (const scope of [AccessScope.Organization, AccessScope.Project] as const) {
        // eslint-disable-next-line no-await-in-loop
        const [membership] = await testDb(TableName.Membership)
          .insert({
            scope,
            scopeOrgId: orgId,
            scopeProjectId: scope === AccessScope.Project ? projectId : null,
            actorGroupId: created.id
          })
          .returning("*");
        // eslint-disable-next-line no-await-in-loop
        await testDb(TableName.MembershipRole).insert({
          membershipId: membership.id,
          role: scope === AccessScope.Project ? ProjectMembershipRole.Member : OrgMembershipRole.Member
        });
      }

      return { id: created.id, name: created.name, slug: created.slug, orgId };
    };

    beforeAll(async () => {
      removalDeps = {
        identityDAL: identityDALFactory(testDb),
        membershipDAL: membershipDALFactory(testDb),
        identityGroupMembershipDAL: identityGroupMembershipDALFactory(testDb),
        additionalPrivilegeDAL: additionalPrivilegeDALFactory(testDb)
      };

      const [identity] = await testDb(TableName.Identity)
        .insert({ name: `identity-folder-reap-${alphaNumericNanoId(8)}`, orgId })
        .returning("*");
      reapIdentityId = identity.id;

      const [orgMembership] = await testDb(TableName.Membership)
        .insert({
          scope: AccessScope.Organization,
          scopeOrgId: orgId,
          actorIdentityId: reapIdentityId
        })
        .returning("*");
      await testDb(TableName.MembershipRole).insert({ membershipId: orgMembership.id, role: OrgMembershipRole.Member });

      ({ identityId: directIdentityId } = await createProjectIdentity(ProjectMembershipRole.Member));

      firstGroup = await createProjectGroup();
      secondGroup = await createProjectGroup();
      await testDb(TableName.IdentityGroupMembership).insert([
        { identityId: reapIdentityId, groupId: firstGroup.id },
        { identityId: reapIdentityId, groupId: secondGroup.id },
        { identityId: directIdentityId, groupId: firstGroup.id }
      ]);
    });

    afterAll(async () => {
      const groupIds = [firstGroup.id, secondGroup.id];
      await testDb(TableName.AdditionalPrivilege).whereIn("actorIdentityId", [reapIdentityId, directIdentityId]).del();
      await testDb(TableName.IdentityGroupMembership).whereIn("groupId", groupIds).del();
      await testDb(TableName.Membership).whereIn("actorGroupId", groupIds).del();
      await testDb(TableName.Groups).whereIn("id", groupIds).del();
      await deleteProjectIdentity(reapIdentityId);
      await deleteProjectIdentity(directIdentityId);
    });

    test("deletes the grant only when the last group-derived project access is removed", async () => {
      const createRes = await testServer.inject({
        method: "POST",
        url: folderAccessUrl(reapIdentityId),
        headers: authHeaders(),
        body: { ...folderTarget, permission: SecretFolderRole.Read }
      });
      expect(createRes.statusCode).toBe(200);
      const grantId = createRes.json().folderAccess.id;

      await removeIdentitiesFromGroup({ ...removalDeps, group: firstGroup, identityIds: [reapIdentityId] });

      // still reaches the project through the second group, so the grant survives untouched
      expect(await testDb(TableName.AdditionalPrivilege).where({ id: grantId })).toHaveLength(1);

      await removeIdentitiesFromGroup({ ...removalDeps, group: secondGroup, identityIds: [reapIdentityId] });

      expect(await testDb(TableName.AdditionalPrivilege).where({ id: grantId })).toEqual([]);
    });

    test("keeps the grant when the identity still holds a direct project membership", async () => {
      const createRes = await testServer.inject({
        method: "POST",
        url: folderAccessUrl(directIdentityId),
        headers: authHeaders(),
        body: { ...folderTarget, permission: SecretFolderRole.Read }
      });
      expect(createRes.statusCode).toBe(200);
      const grantId = createRes.json().folderAccess.id;

      await removeIdentitiesFromGroup({ ...removalDeps, group: firstGroup, identityIds: [directIdentityId] });

      expect(await testDb(TableName.AdditionalPrivilege).where({ id: grantId })).toHaveLength(1);
    });
  });

  describe("sub-org group removal reaps folder grants", () => {
    let subOrgId: string;
    let subOrgProjectId: string;
    let subOrgEnvId: string;
    let subOrgFolderId: string;
    let groupOnlyIdentityId: string;
    let stillLinkedIdentityId: string;
    let soleGroupId: string;
    let firstOfTwoGroupsId: string;
    let secondOfTwoGroupsId: string;

    const insertGroupMembership = async ({
      actorGroupId,
      scopeOrgId,
      scopeProjectId,
      role
    }: {
      actorGroupId: string;
      scopeOrgId: string;
      scopeProjectId?: string;
      role: OrgMembershipRole | ProjectMembershipRole;
    }) => {
      const [membership] = await testDb(TableName.Membership)
        .insert({
          scope: scopeProjectId ? AccessScope.Project : AccessScope.Organization,
          scopeOrgId,
          scopeProjectId: scopeProjectId ?? null,
          actorGroupId
        })
        .returning("*");
      await testDb(TableName.MembershipRole).insert({ membershipId: membership.id, role });
    };

    const createParentGroupLinkedToSubOrgProject = async () => {
      const slug = `identity-folder-suborg-grp-${alphaNumericNanoId(8)}`.toLowerCase();
      const [created] = await testDb(TableName.Groups).insert({ orgId, name: slug, slug }).returning("*");
      await insertGroupMembership({
        actorGroupId: created.id,
        scopeOrgId: orgId,
        role: OrgMembershipRole.Member
      });
      await insertGroupMembership({
        actorGroupId: created.id,
        scopeOrgId: subOrgId,
        role: OrgMembershipRole.Member
      });
      await insertGroupMembership({
        actorGroupId: created.id,
        scopeOrgId: subOrgId,
        scopeProjectId: subOrgProjectId,
        role: ProjectMembershipRole.Member
      });
      return created.id;
    };

    const createOrgOnlyIdentity = async () => {
      const [identity] = await testDb(TableName.Identity)
        .insert({ name: `identity-folder-suborg-${alphaNumericNanoId(8)}`, orgId })
        .returning("*");
      const [orgMembership] = await testDb(TableName.Membership)
        .insert({
          scope: AccessScope.Organization,
          scopeOrgId: orgId,
          actorIdentityId: identity.id
        })
        .returning("*");
      await testDb(TableName.MembershipRole).insert({
        membershipId: orgMembership.id,
        role: OrgMembershipRole.Member
      });
      return identity.id;
    };

    const grantOnSubOrgFolder = async (targetIdentityId: string) => {
      const [grant] = await testDb(TableName.AdditionalPrivilege)
        .insert({
          name: `suborg-folder-grant-${alphaNumericNanoId(8)}`,
          actorIdentityId: targetIdentityId,
          projectId: subOrgProjectId,
          folderId: subOrgFolderId,
          role: SecretFolderRole.Read,
          permissions: JSON.stringify([])
        })
        .returning("*");
      return grant.id;
    };

    const removeIdentityFromGroup = async (groupId: string, targetIdentityId: string) => {
      const res = await testServer.inject({
        method: "DELETE",
        url: `/api/v1/groups/${groupId}/machine-identities/${targetIdentityId}`,
        headers: authHeaders()
      });
      expect(res.statusCode).toBe(200);
    };

    beforeAll(async () => {
      const suffix = alphaNumericNanoId(8).toLowerCase();
      const [subOrg] = await testDb(TableName.Organization)
        .insert({
          name: `folder-suborg-${suffix}`,
          slug: `folder-suborg-${suffix}`,
          parentOrgId: orgId,
          rootOrgId: orgId
        })
        .returning("*");
      subOrgId = subOrg.id;

      const [subOrgProject] = await testDb(TableName.Project)
        .insert({
          name: `folder-suborg-proj-${suffix}`,
          slug: `folder-suborg-proj-${suffix}`,
          orgId: subOrgId,
          type: ProjectType.SecretManager
        })
        .returning("*");
      subOrgProjectId = subOrgProject.id;

      const [env] = await testDb(TableName.Environment)
        .insert({ name: "Development", slug: "dev", position: 1, projectId: subOrgProjectId })
        .returning("*");
      subOrgEnvId = env.id;
      const [rootFolder] = await testDb(TableName.SecretFolder)
        .insert({ name: "root", envId: env.id, parentId: null })
        .returning("*");
      const [subOrgFolder] = await testDb(TableName.SecretFolder)
        .insert({ name: "suborg-folder-access", envId: env.id, parentId: rootFolder.id })
        .returning("*");
      subOrgFolderId = subOrgFolder.id;

      groupOnlyIdentityId = await createOrgOnlyIdentity();
      stillLinkedIdentityId = await createOrgOnlyIdentity();
      soleGroupId = await createParentGroupLinkedToSubOrgProject();
      firstOfTwoGroupsId = await createParentGroupLinkedToSubOrgProject();
      secondOfTwoGroupsId = await createParentGroupLinkedToSubOrgProject();

      await testDb(TableName.IdentityGroupMembership).insert([
        { identityId: groupOnlyIdentityId, groupId: soleGroupId },
        { identityId: stillLinkedIdentityId, groupId: firstOfTwoGroupsId },
        { identityId: stillLinkedIdentityId, groupId: secondOfTwoGroupsId }
      ]);
    });

    afterAll(async () => {
      const groupIds = [soleGroupId, firstOfTwoGroupsId, secondOfTwoGroupsId];
      await testDb(TableName.AdditionalPrivilege)
        .whereIn("actorIdentityId", [groupOnlyIdentityId, stillLinkedIdentityId])
        .del();
      await testDb(TableName.IdentityGroupMembership).whereIn("groupId", groupIds).del();
      await testDb(TableName.Membership).whereIn("actorGroupId", groupIds).del();
      await testDb(TableName.Groups).whereIn("id", groupIds).del();
      await testDb(TableName.Membership).whereIn("actorIdentityId", [groupOnlyIdentityId, stillLinkedIdentityId]).del();
      await testDb(TableName.Identity).whereIn("id", [groupOnlyIdentityId, stillLinkedIdentityId]).del();
      await testDb(TableName.SecretFolder).where({ id: subOrgFolderId }).del();
      await testDb(TableName.SecretFolder).where({ envId: subOrgEnvId }).del();
      await testDb(TableName.Environment).where({ id: subOrgEnvId }).del();
      await testDb(TableName.Project).where({ id: subOrgProjectId }).del();
      await testDb(TableName.Organization).where({ id: subOrgId }).del();
    });

    test("reaps the grant of a group-only identity that reached the sub-org project through the linked group", async () => {
      const grantId = await grantOnSubOrgFolder(groupOnlyIdentityId);

      await removeIdentityFromGroup(soleGroupId, groupOnlyIdentityId);

      expect(await testDb(TableName.AdditionalPrivilege).where({ id: grantId })).toEqual([]);
    });

    test("keeps the grant while another linked group still reaches the sub-org project", async () => {
      const grantId = await grantOnSubOrgFolder(stillLinkedIdentityId);

      await removeIdentityFromGroup(firstOfTwoGroupsId, stillLinkedIdentityId);

      expect(await testDb(TableName.AdditionalPrivilege).where({ id: grantId })).toHaveLength(1);

      await removeIdentityFromGroup(secondOfTwoGroupsId, stillLinkedIdentityId);

      expect(await testDb(TableName.AdditionalPrivilege).where({ id: grantId })).toEqual([]);
    });
  });

  describe("group removed from project reaps folder grants", () => {
    let groupOnlyIdentityId: string;
    let directIdentityId: string;
    let group: { id: string };

    const createProjectGroup = async () => {
      const slug = `identity-folder-proj-reap-grp-${alphaNumericNanoId(8)}`.toLowerCase();
      const [created] = await testDb(TableName.Groups).insert({ orgId, name: slug, slug }).returning("*");

      for (const scope of [AccessScope.Organization, AccessScope.Project] as const) {
        // eslint-disable-next-line no-await-in-loop
        const [membership] = await testDb(TableName.Membership)
          .insert({
            scope,
            scopeOrgId: orgId,
            scopeProjectId: scope === AccessScope.Project ? projectId : null,
            actorGroupId: created.id
          })
          .returning("*");
        // eslint-disable-next-line no-await-in-loop
        await testDb(TableName.MembershipRole).insert({
          membershipId: membership.id,
          role: scope === AccessScope.Project ? ProjectMembershipRole.Member : OrgMembershipRole.Member
        });
      }

      return { id: created.id };
    };

    beforeAll(async () => {
      group = await createProjectGroup();

      const [groupOnlyIdentity] = await testDb(TableName.Identity)
        .insert({ name: `identity-folder-proj-reap-${alphaNumericNanoId(8)}`, orgId })
        .returning("*");
      groupOnlyIdentityId = groupOnlyIdentity.id;
      const [groupOnlyOrgMembership] = await testDb(TableName.Membership)
        .insert({
          scope: AccessScope.Organization,
          scopeOrgId: orgId,
          actorIdentityId: groupOnlyIdentityId
        })
        .returning("*");
      await testDb(TableName.MembershipRole).insert({
        membershipId: groupOnlyOrgMembership.id,
        role: OrgMembershipRole.Member
      });

      ({ identityId: directIdentityId } = await createProjectIdentity(ProjectMembershipRole.Member));

      await testDb(TableName.IdentityGroupMembership).insert([
        { identityId: groupOnlyIdentityId, groupId: group.id },
        { identityId: directIdentityId, groupId: group.id }
      ]);
    });

    afterAll(async () => {
      await testDb(TableName.AdditionalPrivilege)
        .whereIn("actorIdentityId", [groupOnlyIdentityId, directIdentityId])
        .del();
      await testDb(TableName.IdentityGroupMembership).where({ groupId: group.id }).del();
      await testDb(TableName.Membership).where({ actorGroupId: group.id }).del();
      await testDb(TableName.Groups).where({ id: group.id }).del();
      await deleteProjectIdentity(groupOnlyIdentityId);
      await deleteProjectIdentity(directIdentityId);
    });

    test("reaps the grant for a group-only identity and keeps it for a direct project member", async () => {
      const groupOnlyGrantRes = await testServer.inject({
        method: "POST",
        url: folderAccessUrl(groupOnlyIdentityId),
        headers: authHeaders(),
        body: { ...folderTarget, permission: SecretFolderRole.Read }
      });
      expect(groupOnlyGrantRes.statusCode).toBe(200);
      const groupOnlyGrantId = groupOnlyGrantRes.json().folderAccess.id;

      const directMemberGrantRes = await testServer.inject({
        method: "POST",
        url: folderAccessUrl(directIdentityId),
        headers: authHeaders(),
        body: { ...folderTarget, permission: SecretFolderRole.Read }
      });
      expect(directMemberGrantRes.statusCode).toBe(200);
      const directMemberGrantId = directMemberGrantRes.json().folderAccess.id;

      const removeRes = await testServer.inject({
        method: "DELETE",
        url: `/api/v1/projects/${projectId}/memberships/groups/${group.id}`,
        headers: authHeaders()
      });
      expect(removeRes.statusCode).toBe(200);

      expect(await testDb(TableName.AdditionalPrivilege).where({ id: groupOnlyGrantId })).toEqual([]);
      expect(await testDb(TableName.AdditionalPrivilege).where({ id: directMemberGrantId })).toHaveLength(1);
    });
  });
  describe("group deletion reaps folder grants", () => {
    let groupOnlyIdentityId: string;
    let directIdentityId: string;
    let soleGroupId: string;
    let firstOfTwoGroupsId: string;
    let secondOfTwoGroupsId: string;
    let reapDeps: Parameters<typeof reapDeletedGroupFolderGrants>[0];

    const createProjectGroup = async () => {
      const slug = `identity-folder-del-grp-${alphaNumericNanoId(8)}`.toLowerCase();
      const [created] = await testDb(TableName.Groups).insert({ orgId, name: slug, slug }).returning("*");

      for (const scope of [AccessScope.Organization, AccessScope.Project] as const) {
        // eslint-disable-next-line no-await-in-loop
        const [membership] = await testDb(TableName.Membership)
          .insert({
            scope,
            scopeOrgId: orgId,
            scopeProjectId: scope === AccessScope.Project ? projectId : null,
            actorGroupId: created.id
          })
          .returning("*");
        // eslint-disable-next-line no-await-in-loop
        await testDb(TableName.MembershipRole).insert({
          membershipId: membership.id,
          role: scope === AccessScope.Project ? ProjectMembershipRole.Member : OrgMembershipRole.Member
        });
      }

      return created.id;
    };

    const createOrgOnlyIdentity = async () => {
      const [identity] = await testDb(TableName.Identity)
        .insert({ name: `identity-folder-del-${alphaNumericNanoId(8)}`, orgId })
        .returning("*");

      const [orgMembership] = await testDb(TableName.Membership)
        .insert({ scope: AccessScope.Organization, scopeOrgId: orgId, actorIdentityId: identity.id })
        .returning("*");
      await testDb(TableName.MembershipRole).insert({ membershipId: orgMembership.id, role: OrgMembershipRole.Member });

      return identity.id;
    };

    const grantFolderAccess = async (targetIdentityId: string) => {
      const res = await testServer.inject({
        method: "POST",
        url: folderAccessUrl(targetIdentityId),
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

      groupOnlyIdentityId = await createOrgOnlyIdentity();
      ({ identityId: directIdentityId } = await createProjectIdentity(ProjectMembershipRole.Member));

      soleGroupId = await createProjectGroup();
      firstOfTwoGroupsId = await createProjectGroup();
      secondOfTwoGroupsId = await createProjectGroup();

      await testDb(TableName.IdentityGroupMembership).insert([
        { identityId: groupOnlyIdentityId, groupId: soleGroupId },
        { identityId: directIdentityId, groupId: soleGroupId },
        { identityId: groupOnlyIdentityId, groupId: firstOfTwoGroupsId },
        { identityId: groupOnlyIdentityId, groupId: secondOfTwoGroupsId }
      ]);
    });

    afterAll(async () => {
      const groupIds = [soleGroupId, firstOfTwoGroupsId, secondOfTwoGroupsId];
      await testDb(TableName.AdditionalPrivilege)
        .whereIn("actorIdentityId", [groupOnlyIdentityId, directIdentityId])
        .del();
      await testDb(TableName.IdentityGroupMembership).whereIn("groupId", groupIds).del();
      await testDb(TableName.Membership).whereIn("actorGroupId", groupIds).del();
      await testDb(TableName.Groups).whereIn("id", groupIds).del();
      await deleteProjectIdentity(groupOnlyIdentityId);
      await deleteProjectIdentity(directIdentityId);
    });

    test("keeps the grant while another group still reaches the project, and reaps it with the last one", async () => {
      const grantId = await grantFolderAccess(groupOnlyIdentityId);

      await reapDeletedGroupFolderGrants(reapDeps, firstOfTwoGroupsId, testDb);
      await deleteGroupRow(firstOfTwoGroupsId);

      expect(await testDb(TableName.AdditionalPrivilege).where({ id: grantId })).toHaveLength(1);

      await reapDeletedGroupFolderGrants(reapDeps, secondOfTwoGroupsId, testDb);
      await deleteGroupRow(secondOfTwoGroupsId);
      await reapDeletedGroupFolderGrants(reapDeps, soleGroupId, testDb);

      expect(await testDb(TableName.AdditionalPrivilege).where({ id: grantId })).toEqual([]);
    });

    test("keeps the grant when the identity still holds a direct project membership", async () => {
      const grantId = await grantFolderAccess(directIdentityId);

      await reapDeletedGroupFolderGrants(reapDeps, soleGroupId, testDb);
      await deleteGroupRow(soleGroupId);

      expect(await testDb(TableName.AdditionalPrivilege).where({ id: grantId })).toHaveLength(1);
    });

    test("reaps only folder grants, leaving the identity's other privileges alone", async () => {
      const otherIdentityId = await createOrgOnlyIdentity();
      const otherGroupId = await createProjectGroup();
      await testDb(TableName.IdentityGroupMembership).insert({ identityId: otherIdentityId, groupId: otherGroupId });

      const folderGrantId = await grantFolderAccess(otherIdentityId);
      const [projectPrivilege] = await testDb(TableName.AdditionalPrivilege)
        .insert({
          name: `proj-priv-${alphaNumericNanoId(8)}`,
          actorIdentityId: otherIdentityId,
          projectId,
          permissions: JSON.stringify([])
        })
        .returning("*");

      await reapDeletedGroupFolderGrants(reapDeps, otherGroupId, testDb);
      await deleteGroupRow(otherGroupId);

      expect(await testDb(TableName.AdditionalPrivilege).where({ id: folderGrantId })).toEqual([]);
      expect(await testDb(TableName.AdditionalPrivilege).where({ id: projectPrivilege.id })).toHaveLength(1);

      await testDb(TableName.AdditionalPrivilege).where({ actorIdentityId: otherIdentityId }).del();
      await testDb(TableName.IdentityGroupMembership).where({ groupId: otherGroupId }).del();
      await testDb(TableName.Membership).where({ actorGroupId: otherGroupId }).del();
      await deleteProjectIdentity(otherIdentityId);
    });
  });
});
