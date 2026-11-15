import { afterAll, describe, expect, test } from "vitest";

import { OrgMembershipRole, OrgMembershipStatus, TableName } from "@app/db/schemas";
import { membershipUserDALFactory } from "@app/services/membership-user/membership-user-dal";
import { orgDALFactory } from "@app/services/org/org-dal";

import { createEmptyOrg, deleteOrgs } from "./testUtils/fixtures";
import { addUsersToGroup, createOrgGroup } from "./testUtils/groups";
import { waitUntilBlockedBy } from "./testUtils/poll";
import { addUserMembership, createUser, deleteUsers } from "./testUtils/users";

const orgDAL = orgDALFactory(testDb);
const membershipUserDAL = membershipUserDALFactory(testDb);

const userIds: string[] = [];
const rootOrgIds: string[] = [];

const newUser = async (label: string) => {
  const { userId } = await createUser(label);
  userIds.push(userId);
  return userId;
};

const newRootOrg = async () => {
  const org = await createEmptyOrg({ namePrefix: "account-deletion" });
  rootOrgIds.push(org.orgId);
  return org;
};

// An org whose only accepted, active member is a fresh user, the starting point every case changes.
const newOrgWithSoleMember = async (role = OrgMembershipRole.Admin) => {
  const org = await newRootOrg();
  const userId = await newUser("sole-member");
  const membershipId = await addUserMembership({ userId, orgId: org.orgId, role });
  return { ...org, userId, membershipId };
};

afterAll(async () => {
  await deleteOrgs(rootOrgIds);
  await deleteUsers(userIds);
});

describe("orgDAL.findOrgsWhereUserIsLastMember", () => {
  const lastMemberOrgIds = async (userId: string) =>
    (await orgDAL.findOrgsWhereUserIsLastMember(userId)).map((org) => org.id);

  test("lists an org whose only member is the user", async () => {
    const { orgId, name, userId } = await newOrgWithSoleMember();

    expect(await orgDAL.findOrgsWhereUserIsLastMember(userId)).toEqual([{ id: orgId, name }]);
  });

  test("keeps an org another accepted member can sign in to", async () => {
    const { orgId, userId } = await newOrgWithSoleMember();
    await addUserMembership({ userId: await newUser("other"), orgId, role: OrgMembershipRole.Member });

    expect(await lastMemberOrgIds(userId)).toEqual([]);
  });

  test("does not count a member who is only invited, deactivated, or a ghost user", async () => {
    const { orgId, userId } = await newOrgWithSoleMember();
    await addUserMembership({
      userId: await newUser("invited"),
      orgId,
      role: OrgMembershipRole.Admin,
      status: OrgMembershipStatus.Invited
    });
    await addUserMembership({
      userId: await newUser("deactivated"),
      orgId,
      role: OrgMembershipRole.Admin,
      isActive: false
    });
    const ghostId = await newUser("ghost");
    await testDb(TableName.Users).where({ id: ghostId }).update({ isGhost: true });
    await addUserMembership({ userId: ghostId, orgId, role: OrgMembershipRole.Admin });

    expect(await lastMemberOrgIds(userId)).toEqual([orgId]);
  });

  test("keeps an org someone else reaches through a group", async () => {
    const { orgId, name, userId } = await newOrgWithSoleMember();
    const groupId = await createOrgGroup({ orgId, name: `${name}-group`, role: OrgMembershipRole.Member });

    expect(await lastMemberOrgIds(userId)).toEqual([orgId]);

    await addUsersToGroup(groupId, [await newUser("group-member")]);

    expect(await lastMemberOrgIds(userId)).toEqual([]);
  });

  test("keeps a root org someone else can sign in to through one of its sub-orgs", async () => {
    const { orgId, userId } = await newOrgWithSoleMember();
    const subOrg = await createEmptyOrg({ namePrefix: "account-deletion-sub", rootOrgId: orgId });

    expect(await lastMemberOrgIds(userId)).toEqual([orgId]);

    await addUserMembership({
      userId: await newUser("sub-org-member"),
      orgId: subOrg.orgId,
      role: OrgMembershipRole.Member
    });

    expect(await lastMemberOrgIds(userId)).toEqual([]);
  });

  test("never lists a sub-org, which goes with its root", async () => {
    const root = await newRootOrg();
    const subOrg = await createEmptyOrg({ namePrefix: "account-deletion-sub", rootOrgId: root.orgId });
    const userId = await newUser("sub-org-only");
    await addUserMembership({ userId, orgId: subOrg.orgId, role: OrgMembershipRole.Admin });

    expect(await lastMemberOrgIds(userId)).toEqual([]);
  });

  test("does not list an org the user was deactivated in or has not joined", async () => {
    const deactivatedIn = await newRootOrg();
    const invitedTo = await newRootOrg();
    const userId = await newUser("no-access");
    await addUserMembership({ userId, orgId: deactivatedIn.orgId, role: OrgMembershipRole.Admin, isActive: false });
    await addUserMembership({
      userId,
      orgId: invitedTo.orgId,
      role: OrgMembershipRole.Admin,
      status: OrgMembershipStatus.Invited
    });

    expect(await lastMemberOrgIds(userId)).toEqual([]);
  });
});

describe("orgDAL.lockOrgTreeAccessForDeletion", () => {
  test("waits for an invite being accepted, so the check after it sees the new member", async () => {
    const { orgId, userId } = await newOrgWithSoleMember();
    const invitedMembershipId = await addUserMembership({
      userId: await newUser("accepting"),
      orgId,
      role: OrgMembershipRole.Member,
      status: OrgMembershipStatus.Invited
    });

    const accept = await testDb.transaction();
    const deletion = await testDb.transaction();
    try {
      const { rows } = await accept.raw("select pg_backend_pid() as pid");
      await accept(TableName.Membership)
        .where({ id: invitedMembershipId })
        .update({ status: OrgMembershipStatus.Accepted });

      const lastMemberOrgs = orgDAL
        .lockOrgTreeAccessForDeletion(orgId, deletion)
        .then(() => orgDAL.findOrgsWhereUserIsLastMember(userId, deletion));
      await waitUntilBlockedBy(rows[0].pid as number);
      await accept.commit();

      expect(await lastMemberOrgs).toEqual([]);
    } finally {
      if (!accept.isCompleted()) await accept.rollback();
      if (!deletion.isCompleted()) await deletion.rollback();
    }
  });

  test("makes someone joining wait until the deletion finishes", async () => {
    const { orgId } = await newOrgWithSoleMember();
    const joiningUserId = await newUser("joining");

    const deletion = await testDb.transaction();
    try {
      const { rows } = await deletion.raw("select pg_backend_pid() as pid");
      await orgDAL.lockOrgTreeAccessForDeletion(orgId, deletion);

      const join = addUserMembership({ userId: joiningUserId, orgId, role: OrgMembershipRole.Member });
      // The insert's error can reach us before the commit's reply does, so the rejection needs a handler
      // before the commit, or Vitest reports it as unhandled and fails the run.
      const joinRejected = expect(join).rejects.toThrow(/foreign key/);
      await waitUntilBlockedBy(rows[0].pid as number);
      await deletion(TableName.Organization).where({ id: orgId }).delete();
      await deletion.commit();

      await joinRejected;
    } finally {
      if (!deletion.isCompleted()) await deletion.rollback();
    }
  });
});

describe("membershipUserDAL.findOrgsWhereUserIsLastAdmin", () => {
  const lastAdminOrgIds = async (userId: string) =>
    (await membershipUserDAL.findOrgsWhereUserIsLastAdmin(userId)).map((org) => org.id);

  test("lists an org whose other members are not admins", async () => {
    const { orgId, name, userId } = await newOrgWithSoleMember();
    await addUserMembership({ userId: await newUser("member"), orgId, role: OrgMembershipRole.Member });

    expect(await membershipUserDAL.findOrgsWhereUserIsLastAdmin(userId)).toEqual([
      { id: orgId, name, rootOrgId: null }
    ]);
  });

  test("does not list an org with another active admin", async () => {
    const { orgId, userId } = await newOrgWithSoleMember();
    await addUserMembership({ userId: await newUser("admin"), orgId, role: OrgMembershipRole.Admin });

    expect(await lastAdminOrgIds(userId)).toEqual([]);
  });

  test("does not count a deactivated admin as a replacement", async () => {
    const { orgId, userId } = await newOrgWithSoleMember();
    await addUserMembership({
      userId: await newUser("deactivated-admin"),
      orgId,
      role: OrgMembershipRole.Admin,
      isActive: false
    });

    expect(await lastAdminOrgIds(userId)).toEqual([orgId]);
  });

  test("does not list an org where the user is not an active, accepted admin", async () => {
    const asMember = await newRootOrg();
    const deactivatedIn = await newRootOrg();
    const invitedTo = await newRootOrg();
    const userId = await newUser("not-admin");
    await addUserMembership({ userId, orgId: asMember.orgId, role: OrgMembershipRole.Member });
    await addUserMembership({ userId, orgId: deactivatedIn.orgId, role: OrgMembershipRole.Admin, isActive: false });
    await addUserMembership({
      userId,
      orgId: invitedTo.orgId,
      role: OrgMembershipRole.Admin,
      status: OrgMembershipStatus.Invited
    });

    expect(await lastAdminOrgIds(userId)).toEqual([]);
  });
});
