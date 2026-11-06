import { randomUUID } from "node:crypto";

import { OrgMembershipRole, TableName } from "@app/db/schemas";

import { createIsolatedOrgAndProject, createSubOrgAndProject } from "../../testUtils/fixtures";
import { addUsersToGroup, createOrgGroup, deleteGroups } from "../../testUtils/groups";
import { addUserMembership, createUser, deleteUsers } from "../../testUtils/users";

// Removal is scoped to the org it happens in: the user leaves the groups that org (and, from the root,
// its sub-orgs) owns, but a root group linked into a sub-org is the root org's to manage.
describe("Removing a user from an organization", () => {
  let rootOrgId: string;
  let rootToken: string;
  let cleanupRootOrg: () => Promise<void>;
  let subOrgId: string;
  let subOrgToken: string;
  const createdUserIds: string[] = [];
  const createdGroupIds: string[] = [];

  const createGroup = async (orgId: string, ownerOrgId?: string) => {
    const groupId = await createOrgGroup({
      orgId,
      ownerOrgId,
      name: `user-removal-grp-${randomUUID().slice(0, 8)}`,
      role: OrgMembershipRole.NoAccess
    });
    createdGroupIds.push(groupId);
    return groupId;
  };

  const setUpUser = async () => {
    const { userId } = await createUser("user-removal");
    createdUserIds.push(userId);
    const rootMembershipId = await addUserMembership({ userId, orgId: rootOrgId, role: OrgMembershipRole.Member });
    const subMembershipId = await addUserMembership({ userId, orgId: subOrgId, role: OrgMembershipRole.Member });

    const rootGroupId = await createGroup(rootOrgId);
    const linkedRootGroupId = await createGroup(subOrgId, rootOrgId);
    const subGroupId = await createGroup(subOrgId);
    await Promise.all(
      [rootGroupId, linkedRootGroupId, subGroupId].map((groupId) => addUsersToGroup(groupId, [userId]))
    );

    return { userId, rootMembershipId, subMembershipId, rootGroupId, linkedRootGroupId, subGroupId };
  };

  const removeMembership = async (orgId: string, membershipId: string, authToken: string) => {
    const res = await testServer.inject({
      method: "DELETE",
      url: `/api/v2/organizations/${orgId}/memberships/${membershipId}`,
      headers: { authorization: `Bearer ${authToken}` }
    });
    expect(res.statusCode).toBe(200);
  };

  const groupIdsOf = (userId: string) =>
    testDb(TableName.UserGroupMembership).where({ userId }).pluck("groupId") as Promise<string[]>;

  beforeAll(async () => {
    const root = await createIsolatedOrgAndProject("user-removal-groups");
    rootOrgId = root.orgId;
    rootToken = root.authToken;
    cleanupRootOrg = root.cleanup;

    const sub = await createSubOrgAndProject({ rootOrgId, namePrefix: "user-removal-groups-sub" });
    subOrgId = sub.subOrgId;
    subOrgToken = sub.authToken;
  });

  afterAll(async () => {
    await deleteGroups(createdGroupIds);
    await deleteUsers(createdUserIds);
    await cleanupRootOrg();
  });

  test("from a sub-org drops the sub-org's own groups and keeps root groups, linked ones included", async () => {
    const { userId, subMembershipId, rootGroupId, linkedRootGroupId, subGroupId } = await setUpUser();

    await removeMembership(subOrgId, subMembershipId, subOrgToken);

    expect(await groupIdsOf(userId)).not.toContain(subGroupId);
    expect(await groupIdsOf(userId)).toEqual(expect.arrayContaining([rootGroupId, linkedRootGroupId]));
  });

  test("from the root org drops the groups of the root and its sub-orgs", async () => {
    const { userId, rootMembershipId } = await setUpUser();

    await removeMembership(rootOrgId, rootMembershipId, rootToken);

    expect(await groupIdsOf(userId)).toHaveLength(0);
  });
});
