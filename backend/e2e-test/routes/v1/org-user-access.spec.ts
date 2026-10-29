import { OrgMembershipRole } from "@app/db/schemas";

import { createIsolatedOrgAndProject } from "../../testUtils/fixtures";
import { addUsersToGroup, createOrgGroup } from "../../testUtils/groups";
import { addUserMembership, createUser, deleteUsers } from "../../testUtils/users";

type TUserAccessRow = {
  user: { id: string; username: string };
  membership: { id: string; role: string; status: string; isActive: boolean } | null;
  groups: { id: string; name: string; slug: string; roles: { role: string }[] }[];
};

const HOUR_MS = 60 * 60 * 1000;

describe("Organization user access listing", () => {
  let orgId: string;
  let authToken: string;
  let cleanup: () => Promise<void>;
  let directUser: { userId: string; username: string };
  let directAndGroupUser: { userId: string; username: string };
  let groupOnlyUser: { userId: string; username: string };
  let adminGroupId: string;
  let memberGroupId: string;
  let linkedGroupId: string;
  let cleanupParentOrg: () => Promise<void>;

  const listUserAccess = async () => {
    const res = await testServer.inject({
      method: "GET",
      url: `/api/v1/organization/${orgId}/user-access`,
      headers: { authorization: `Bearer ${authToken}` }
    });
    expect(res.statusCode).toBe(200);
    return res.json().users as TUserAccessRow[];
  };

  beforeAll(async () => {
    ({ orgId, authToken, cleanup } = await createIsolatedOrgAndProject("user-access"));
    const parentOrg = await createIsolatedOrgAndProject("user-access-parent");
    cleanupParentOrg = parentOrg.cleanup;

    directUser = await createUser("direct");
    directAndGroupUser = await createUser("direct-and-group");
    groupOnlyUser = await createUser("group-only");

    await addUserMembership({ userId: directUser.userId, orgId, role: OrgMembershipRole.Member });
    await addUserMembership({ userId: directAndGroupUser.userId, orgId, role: OrgMembershipRole.Member });

    adminGroupId = await createOrgGroup({
      orgId,
      name: "engineering",
      role: OrgMembershipRole.Admin,
      temporaryRole: { role: OrgMembershipRole.Member, endsAt: new Date(Date.now() - HOUR_MS) }
    });
    memberGroupId = await createOrgGroup({
      orgId,
      name: "qa-team",
      role: OrgMembershipRole.Member,
      temporaryRole: { role: OrgMembershipRole.Admin, endsAt: new Date(Date.now() + HOUR_MS) }
    });

    // Same name and the same role pair as qa-team, so its rows interleave with that group's unless the
    // query keeps each group's rows together.
    linkedGroupId = await createOrgGroup({
      orgId,
      ownerOrgId: parentOrg.orgId,
      name: "qa-team",
      role: OrgMembershipRole.Member,
      temporaryRole: { role: OrgMembershipRole.Admin, endsAt: new Date(Date.now() + HOUR_MS) }
    });

    await addUsersToGroup(adminGroupId, [directAndGroupUser.userId, groupOnlyUser.userId]);
    await addUsersToGroup(memberGroupId, [groupOnlyUser.userId]);
    await addUsersToGroup(linkedGroupId, [groupOnlyUser.userId]);
  });

  // Deleting the orgs cascades the groups.
  afterAll(async () => {
    await deleteUsers([directUser.userId, directAndGroupUser.userId, groupOnlyUser.userId]);
    await cleanup();
    await cleanupParentOrg();
  });

  test("lists direct members with their groups and users who reach the org only through a group", async () => {
    const users = await listUserAccess();
    const byUserId = new Map(users.map((row) => [row.user.id, row]));

    const direct = byUserId.get(directUser.userId);
    expect(direct?.membership).toEqual(
      expect.objectContaining({ role: OrgMembershipRole.Member, status: "accepted", isActive: true })
    );
    expect(direct?.groups).toEqual([]);

    const directAndGroup = byUserId.get(directAndGroupUser.userId);
    expect(directAndGroup?.membership).toEqual(expect.objectContaining({ role: OrgMembershipRole.Member }));
    expect(directAndGroup?.groups).toEqual([
      expect.objectContaining({ id: adminGroupId, roles: [{ role: OrgMembershipRole.Admin, roleId: null }] })
    ]);

    const groupOnly = byUserId.get(groupOnlyUser.userId);
    expect(groupOnly?.user.username).toBe(groupOnlyUser.username);
    expect(groupOnly?.membership).toBeNull();
    expect(groupOnly?.groups.map((group) => group.id).sort()).toEqual(
      [adminGroupId, memberGroupId, linkedGroupId].sort()
    );
  });

  test("lists every active role of a group, permanent first, and leaves expired temporary roles out", async () => {
    const users = await listUserAccess();
    const groupOnly = users.find((row) => row.user.id === groupOnlyUser.userId);
    const roleSlugs = (groupId: string) =>
      groupOnly?.groups.find((group) => group.id === groupId)?.roles.map((role) => role.role);

    expect(roleSlugs(adminGroupId)).toEqual([OrgMembershipRole.Admin]);
    expect(roleSlugs(memberGroupId)).toEqual([OrgMembershipRole.Member, OrgMembershipRole.Admin]);
  });

  test("keeps the roles of two groups with the same name apart", async () => {
    const users = await listUserAccess();
    const groupOnly = users.find((row) => row.user.id === groupOnlyUser.userId);
    const sameName = groupOnly?.groups.filter((group) => group.name === "qa-team");

    expect(sameName).toHaveLength(2);
    sameName?.forEach((group) => {
      expect(group.roles.map((role) => role.role)).toEqual([OrgMembershipRole.Member, OrgMembershipRole.Admin]);
    });
  });

  test("leaves the direct membership list unchanged", async () => {
    const res = await testServer.inject({
      method: "GET",
      url: `/api/v1/organization/${orgId}/users`,
      headers: { authorization: `Bearer ${authToken}` }
    });
    expect(res.statusCode).toBe(200);
    const userIds = (res.json().users as { user: { id: string } }[]).map((row) => row.user.id);
    expect(userIds).toContain(directAndGroupUser.userId);
    expect(userIds).not.toContain(groupOnlyUser.userId);
  });
});
