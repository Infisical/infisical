import { randomUUID } from "node:crypto";

import { up } from "@app/db/migrations/20261102120000_remove-orphaned-identity-group-memberships";
import { AccessScope, OrgMembershipRole, TableName } from "@app/db/schemas";

import { createIsolatedOrgAndProject, createSubOrgAndProject } from "./testUtils/fixtures";
import { createOrgGroup, deleteGroups } from "./testUtils/groups";

// The migration deletes an identity's row in a group only when the identity has no org membership in
// the org that owns the group. Everything else, including a parent-org group linked into a sub-org
// and a deactivated membership, has to survive.
describe("Migration: remove orphaned identity group memberships", () => {
  let cleanupRootOrg: () => Promise<void>;
  let rootOrgId: string;
  let subOrgId: string;
  const createdGroupIds: string[] = [];
  const createdIdentityIds: string[] = [];

  const createIdentity = async (memberships: { orgId: string; isActive?: boolean }[]) => {
    const [identity] = await testDb(TableName.Identity)
      .insert({ name: `migration-identity-${randomUUID().slice(0, 8)}`, orgId: rootOrgId })
      .returning("id");
    const identityId = (identity as { id: string }).id;
    createdIdentityIds.push(identityId);
    if (memberships.length) {
      await testDb(TableName.Membership).insert(
        memberships.map((membership) => ({
          scope: AccessScope.Organization,
          scopeOrgId: membership.orgId,
          actorIdentityId: identityId,
          isActive: membership.isActive ?? true
        }))
      );
    }
    return identityId;
  };

  const createGroup = async (orgId: string, ownerOrgId?: string) => {
    const groupId = await createOrgGroup({
      orgId,
      ownerOrgId,
      name: `migration-grp-${randomUUID().slice(0, 8)}`,
      role: OrgMembershipRole.NoAccess
    });
    createdGroupIds.push(groupId);
    return groupId;
  };

  const addToGroup = (identityId: string, groupId: string) =>
    testDb(TableName.IdentityGroupMembership).insert({ identityId, groupId });

  const groupIdsOf = (identityId: string) =>
    testDb(TableName.IdentityGroupMembership).where({ identityId }).pluck("groupId") as Promise<string[]>;

  beforeAll(async () => {
    const root = await createIsolatedOrgAndProject("orphaned-igm-migration");
    rootOrgId = root.orgId;
    cleanupRootOrg = root.cleanup;
    const sub = await createSubOrgAndProject({ rootOrgId, namePrefix: "orphaned-igm-migration-sub" });
    subOrgId = sub.subOrgId;
  });

  afterAll(async () => {
    await deleteGroups(createdGroupIds);
    await testDb(TableName.Membership).whereIn("actorIdentityId", createdIdentityIds).delete();
    await testDb(TableName.Identity).whereIn("id", createdIdentityIds).delete();
    await cleanupRootOrg();
  });

  test("deletes only the rows whose identity has no membership in the group's owning org", async () => {
    const subGroupId = await createGroup(subOrgId);
    const rootGroupId = await createGroup(rootOrgId);
    const linkedRootGroupId = await createGroup(subOrgId, rootOrgId);

    const orphan = await createIdentity([{ orgId: rootOrgId }]);
    const noMembershipAnywhere = await createIdentity([]);
    const activeMember = await createIdentity([{ orgId: rootOrgId }, { orgId: subOrgId }]);
    const deactivatedMember = await createIdentity([{ orgId: rootOrgId }, { orgId: subOrgId, isActive: false }]);
    const linkedGroupMember = await createIdentity([{ orgId: rootOrgId }]);

    await addToGroup(orphan, subGroupId);
    await addToGroup(orphan, rootGroupId);
    await addToGroup(noMembershipAnywhere, subGroupId);
    await addToGroup(activeMember, subGroupId);
    await addToGroup(deactivatedMember, subGroupId);
    await addToGroup(linkedGroupMember, linkedRootGroupId);

    await up(testDb);

    expect(await groupIdsOf(orphan)).toEqual([rootGroupId]);
    expect(await groupIdsOf(noMembershipAnywhere)).toEqual([]);
    expect(await groupIdsOf(activeMember)).toEqual([subGroupId]);
    expect(await groupIdsOf(deactivatedMember)).toEqual([subGroupId]);
    expect(await groupIdsOf(linkedGroupMember)).toEqual([linkedRootGroupId]);
  });

  test("is idempotent", async () => {
    const subGroupId = await createGroup(subOrgId);
    const activeMember = await createIdentity([{ orgId: rootOrgId }, { orgId: subOrgId }]);
    await addToGroup(activeMember, subGroupId);

    await up(testDb);
    await up(testDb);

    expect(await groupIdsOf(activeMember)).toEqual([subGroupId]);
  });
});
