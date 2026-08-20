import {
  AccessScope,
  OrgMembershipRole,
  ProjectMembershipRole,
  SecretFolderRole,
  TableName,
  TemporaryPermissionMode
} from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { ms } from "@app/lib/ms";
import { alphaNumericNanoId } from "@app/lib/nanoid";

const projectId = seedData1.project.id;
const orgId = seedData1.organization.id;
// the seed identity is a project admin; admins cannot receive folder grants, so tests grant to a
// dedicated member identity created in beforeAll
const adminIdentityId = seedData1.machineIdentity.id;

let memberIdentityId: string;
let memberIdentityName: string;

const folderAccessUrl = (folderId: string, targetIdentityId?: string) =>
  `/api/v2/identity-project-additional-privilege/projects/${projectId}/identities/${
    targetIdentityId ?? memberIdentityId
  }/folder-access/${folderId}`;

const folderAccessIdentitiesUrl = (folderId: string, query = "") =>
  `/api/v2/identity-project-additional-privilege/projects/${projectId}/folder-access/${folderId}/identities${query}`;

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

  test("rejects granting to or updating a project admin identity", async () => {
    const createRes = await testServer.inject({
      method: "POST",
      url: folderAccessUrl(folder.id, adminIdentityId),
      headers: authHeaders(),
      body: { permission: SecretFolderRole.Read }
    });
    expect(createRes.statusCode).toBe(400);
    expect(createRes.json().message).toContain("project admin role");

    const patchRes = await testServer.inject({
      method: "PATCH",
      url: folderAccessUrl(folder.id, adminIdentityId),
      headers: authHeaders(),
      body: { permission: SecretFolderRole.Edit }
    });
    expect(patchRes.statusCode).toBe(400);
    expect(patchRes.json().message).toContain("project admin role");
  });

  describe("roster", () => {
    const listIdentities = async (
      query = ""
    ): Promise<{
      identities: { identityId: string; name: string; folderRBACAccess: Record<string, unknown> | null }[];
      totalCount: number;
    }> => {
      const res = await testServer.inject({
        method: "GET",
        url: folderAccessIdentitiesUrl(folder.id, query),
        headers: authHeaders()
      });
      expect(res.statusCode).toBe(200);
      return res.json();
    };

    test("excludes project admin identities from the roster", async () => {
      const { identities } = await listIdentities("?limit=100");
      expect(identities.map((identity) => identity.identityId)).not.toContain(adminIdentityId);
    });

    test("lists project identities and annotates only the granted one", async () => {
      const before = await listIdentities();
      expect(before.totalCount).toBeGreaterThan(0);
      const memberBefore = before.identities.find((identity) => identity.identityId === memberIdentityId);
      expect(memberBefore).toBeDefined();
      expect(memberBefore!.folderRBACAccess).toBeNull();
      expect(memberBefore).not.toHaveProperty("roles");

      const createRes = await testServer.inject({
        method: "POST",
        url: folderAccessUrl(folder.id),
        headers: authHeaders(),
        body: { permission: SecretFolderRole.Edit }
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
        url: folderAccessUrl(folder.id),
        headers: authHeaders()
      });
      expect(deleteRes.statusCode).toBe(200);

      const afterRevoke = await listIdentities();
      expect(
        afterRevoke.identities.find((identity) => identity.identityId === memberIdentityId)!.folderRBACAccess
      ).toBeNull();
    });

    test("filters by search and keeps totalCount stable past the end", async () => {
      const matching = await listIdentities(`?search=${encodeURIComponent(memberIdentityName)}`);
      expect(matching.identities.map((identity) => identity.identityId)).toContain(memberIdentityId);

      const { totalCount } = await listIdentities();

      const pastTheEnd = await listIdentities(`?limit=1&offset=${totalCount + 10}`);
      expect(pastTheEnd.identities).toEqual([]);
      expect(pastTheEnd.totalCount).toBe(totalCount);

      const nonMatching = await listIdentities("?search=zzz-no-such-identity");
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
        const { identities, totalCount } = await listIdentities("?limit=100");

        const groupIdentity = identities.find((identity) => identity.identityId === groupIdentityId);
        expect(groupIdentity).toBeDefined();
        expect(groupIdentity!.folderRBACAccess).toBeNull();

        // the member identity is reachable directly and via the group, and must not be duplicated
        expect(identities.filter((identity) => identity.identityId === memberIdentityId)).toHaveLength(1);
        expect(new Set(identities.map((identity) => identity.identityId)).size).toBe(identities.length);
        expect(totalCount).toBe(identities.length);
      });

      test("grants folder access to a group-derived identity and shows it on the roster", async () => {
        const grantUrl = folderAccessUrl(folder.id, groupIdentityId);

        const createRes = await testServer.inject({
          method: "POST",
          url: grantUrl,
          headers: authHeaders(),
          body: { permission: SecretFolderRole.Read }
        });
        expect(createRes.statusCode).toBe(200);

        const { identities } = await listIdentities("?limit=100");
        const granted = identities.find((identity) => identity.identityId === groupIdentityId);
        expect(granted!.folderRBACAccess).toEqual(
          expect.objectContaining({ folderId: folder.id, permission: SecretFolderRole.Read })
        );

        const deleteRes = await testServer.inject({ method: "DELETE", url: grantUrl, headers: authHeaders() });
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

        test("excludes an identity whose admin role comes from a group", async () => {
          const { identities } = await listIdentities("?limit=100");
          expect(identities.map((identity) => identity.identityId)).not.toContain(groupAdminIdentityId);
        });

        test("rejects granting to an identity whose admin role comes from a group", async () => {
          const res = await testServer.inject({
            method: "POST",
            url: folderAccessUrl(folder.id, groupAdminIdentityId),
            headers: authHeaders(),
            body: { permission: SecretFolderRole.Read }
          });
          expect(res.statusCode).toBe(400);
          expect(res.json().message).toContain("project admin role");
        });
      });
    });
  });
});
