import { AccessScope, OrgMembershipRole, TableName } from "@app/db/schemas";
import { alphaNumericNanoId } from "@app/lib/nanoid";

import { createIsolatedOrgAndProject } from "../../testUtils/fixtures";
import { addUserMembership, createUser, deleteUsers } from "../../testUtils/users";

type TUserAccessRow = {
  user: { id: string; username: string };
  membership: { id: string; role: string; status: string; isActive: boolean } | null;
  groups: { id: string; name: string; slug: string; role: string }[];
};

describe("Organization user access listing", () => {
  let orgId: string;
  let authToken: string;
  let cleanup: () => Promise<void>;
  let directUser: { userId: string; username: string };
  let directAndGroupUser: { userId: string; username: string };
  let groupOnlyUser: { userId: string; username: string };
  let adminGroupId: string;
  let memberGroupId: string;

  // Group rows go straight into the database: the API only adds a user to a group once they are an org
  // member, and the case under test is a user whose only way into the org is the group.
  const createOrgGroup = async (name: string, role: OrgMembershipRole) => {
    const [group] = await testDb(TableName.Groups).insert({ orgId, name, slug: name }).returning("*");
    const [membership] = await testDb(TableName.Membership)
      .insert({ scope: AccessScope.Organization, scopeOrgId: orgId, actorGroupId: group.id, isActive: true })
      .returning("*");
    await testDb(TableName.MembershipRole).insert({ membershipId: membership.id, role });
    return group.id as string;
  };

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
    const suffix = alphaNumericNanoId(8).toLowerCase();

    directUser = await createUser("direct");
    directAndGroupUser = await createUser("direct-and-group");
    groupOnlyUser = await createUser("group-only");

    await addUserMembership({ userId: directUser.userId, orgId, role: OrgMembershipRole.Member });
    await addUserMembership({ userId: directAndGroupUser.userId, orgId, role: OrgMembershipRole.Member });

    adminGroupId = await createOrgGroup(`engineering-${suffix}`, OrgMembershipRole.Admin);
    memberGroupId = await createOrgGroup(`qa-team-${suffix}`, OrgMembershipRole.Member);

    await testDb(TableName.UserGroupMembership).insert([
      { userId: directAndGroupUser.userId, groupId: adminGroupId },
      { userId: groupOnlyUser.userId, groupId: adminGroupId },
      { userId: groupOnlyUser.userId, groupId: memberGroupId }
    ]);
  });

  afterAll(async () => {
    await testDb(TableName.UserGroupMembership).whereIn("groupId", [adminGroupId, memberGroupId]).del();
    await deleteUsers([directUser.userId, directAndGroupUser.userId, groupOnlyUser.userId]);
    await cleanup();
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
      expect.objectContaining({ id: adminGroupId, role: OrgMembershipRole.Admin })
    ]);

    const groupOnly = byUserId.get(groupOnlyUser.userId);
    expect(groupOnly?.user.username).toBe(groupOnlyUser.username);
    expect(groupOnly?.membership).toBeNull();
    expect(groupOnly?.groups.map((group) => group.id).sort()).toEqual([adminGroupId, memberGroupId].sort());
    expect(groupOnly?.groups.find((group) => group.id === memberGroupId)?.role).toBe(OrgMembershipRole.Member);
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
