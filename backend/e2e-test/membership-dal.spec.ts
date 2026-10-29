import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { OrgMembershipRole, ProjectMembershipRole } from "@app/db/schemas";
import { groupDALFactory } from "@app/ee/services/group/group-dal";
import { removeUsersFromGroupByUserIds } from "@app/ee/services/group/group-fns";
import { userGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";
import { additionalPrivilegeDALFactory } from "@app/services/additional-privilege/additional-privilege-dal";
import { alertChannelRecipientDALFactory } from "@app/services/alert/alert-channel-recipient-dal";
import { membershipDALFactory } from "@app/services/membership/membership-dal";
import { membershipGroupDALFactory } from "@app/services/membership-group/membership-group-dal";
import { projectKeyDALFactory } from "@app/services/project-key/project-key-dal";
import { userDALFactory } from "@app/services/user/user-dal";

import { createIsolatedOrgAndProject } from "./testUtils/fixtures";
import { createProjectGroup } from "./testUtils/groups";
import { pollUntil } from "./testUtils/poll";
import { addUserMembership, createUser, deleteUsers } from "./testUtils/users";

const membershipDAL = membershipDALFactory(testDb);

const removalDeps = {
  userDAL: userDALFactory(testDb),
  userGroupMembershipDAL: userGroupMembershipDALFactory(testDb),
  membershipGroupDAL: membershipGroupDALFactory(testDb),
  projectKeyDAL: projectKeyDALFactory(testDb),
  additionalPrivilegeDAL: additionalPrivilegeDALFactory(testDb),
  alertChannelRecipientDAL: alertChannelRecipientDALFactory(testDb),
  groupDAL: groupDALFactory(testDb),
  eventEmitter: { emit: async () => {} }
};

const waitUntilBlockedBy = (pid: number) =>
  pollUntil({
    describe: `a query blocked by backend ${pid}`,
    read: async () => {
      const { rows } = await testDb.raw(
        "select count(*)::int as waiting from pg_stat_activity where ? = any(pg_blocking_pids(pid))",
        [pid]
      );
      return rows[0].waiting as number;
    },
    done: (waiting) => waiting > 0,
    timeoutMs: 5_000
  });

describe("membershipDAL.lockUserProjectMemberships", () => {
  let fixture: Awaited<ReturnType<typeof createIsolatedOrgAndProject>>;
  const userIds: string[] = [];

  const createOrgUser = async (label: string) => {
    const { userId } = await createUser(label);
    userIds.push(userId);
    await addUserMembership({ userId, orgId: fixture.orgId, role: OrgMembershipRole.Member });
    return userId;
  };

  const lockWhileRemovedFromGroup = async (userId: string, group: Awaited<ReturnType<typeof createProjectGroup>>) => {
    const removal = await testDb.transaction();
    const grant = await testDb.transaction();
    try {
      const { rows } = await removal.raw("select pg_backend_pid() as pid");
      await removeUsersFromGroupByUserIds({ ...removalDeps, group, userIds: [userId], tx: removal });

      const isMember = membershipDAL.lockUserProjectMemberships({ projectId: fixture.projectId, userId }, grant);
      await waitUntilBlockedBy(rows[0].pid as number);
      await removal.commit();

      return await isMember;
    } finally {
      if (!removal.isCompleted()) await removal.rollback();
      if (!grant.isCompleted()) await grant.rollback();
    }
  };

  beforeAll(async () => {
    fixture = await createIsolatedOrgAndProject("membership-lock");
  });

  afterAll(async () => {
    await fixture.cleanup();
    await deleteUsers(userIds);
  });

  test("does not count a group the user was removed from while waiting for its lock", async () => {
    const userId = await createOrgUser("group-only");
    const group = await createProjectGroup({ orgId: fixture.orgId, projectId: fixture.projectId, userIds: [userId] });

    expect(await lockWhileRemovedFromGroup(userId, group)).toBe(false);
  });

  test("still counts a direct membership when the user leaves a group while waiting for its lock", async () => {
    const userId = await createOrgUser("direct-and-group");
    await addUserMembership({
      userId,
      orgId: fixture.orgId,
      projectId: fixture.projectId,
      role: ProjectMembershipRole.Member
    });
    const group = await createProjectGroup({ orgId: fixture.orgId, projectId: fixture.projectId, userIds: [userId] });

    expect(await lockWhileRemovedFromGroup(userId, group)).toBe(true);
  });
});
