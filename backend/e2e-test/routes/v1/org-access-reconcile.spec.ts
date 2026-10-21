import { eventOutbox } from "e2e-test/fakes/event-outbox-queue";

import { AccessScope, OrgMembershipRole, ProjectMembershipRole, TableName } from "@app/db/schemas";
import { EventOutboxStatus } from "@app/services/event-outbox/event-outbox-types";
import { ORG_ACCESS_RECONCILE_CONSUMER } from "@app/services/org/org-access-reconcile-consumer";
import { orgDALFactory } from "@app/services/org/org-dal";

import { createIsolatedOrgAndProject, createSubOrgAndProject } from "../../testUtils/fixtures";
import {
  createOrgGroup,
  deleteGroups,
  linkGroupToOrg,
  removeIdentityFromGroup,
  removeUserFromGroup,
  unlinkGroupFromOrg
} from "../../testUtils/groups";
import { createIdentityActor } from "../../testUtils/identities";
import { pollUntil } from "../../testUtils/poll";
import { addUserMembership, createUser, deleteUsers } from "../../testUtils/users";

// A user reaches a sub-org only through a root group linked into it. Removing the group path has to
// reap the direct project rows they hold there, and nothing else: the consumer rechecks current
// state, so a second path keeps the rows, and the root org is untouched throughout.
describe("Org access reconcile", () => {
  let rootOrgId: string;
  let rootProjectId: string;
  let rootToken: string;
  let cleanupRootOrg: () => Promise<void>;
  let subOrgId: string;
  let subOrgProjectId: string;
  let subOrgToken: string;
  const createdUserIds: string[] = [];
  const createdGroupIds: string[] = [];
  const createdIdentityIds: string[] = [];

  const projectRows = (projectId: string, actor: { actorUserId?: string; actorIdentityId?: string }) =>
    testDb(TableName.Membership).where({ scope: AccessScope.Project, scopeProjectId: projectId, ...actor });

  const insertIdentityProjectRow = async (dto: { orgId: string; projectId: string; identityId: string }) => {
    const [membership] = await testDb(TableName.Membership)
      .insert({
        scope: AccessScope.Project,
        scopeOrgId: dto.orgId,
        scopeProjectId: dto.projectId,
        actorIdentityId: dto.identityId
      })
      .returning("id");
    await testDb(TableName.MembershipRole).insert({
      membershipId: (membership as { id: string }).id,
      role: ProjectMembershipRole.Member
    });
  };

  // Drains what is pending now, then waits for whatever the relay may have claimed first, so an
  // assertion that rows survived is made after the consumer has actually run.
  const reconcile = async () => {
    await eventOutbox.drain(ORG_ACCESS_RECONCILE_CONSUMER);
    await pollUntil({
      describe: "the org access reconcile consumer to settle every pending event",
      read: () =>
        testDb(TableName.EventOutbox)
          .where({ consumer: ORG_ACCESS_RECONCILE_CONSUMER })
          .whereIn("status", [EventOutboxStatus.Pending, EventOutboxStatus.Processing, EventOutboxStatus.Retry])
          .count<{ count: string }[]>("id as count")
          .then((rows) => Number(rows[0].count)),
      done: (pending) => pending === 0
    });
  };

  const createLinkedGroup = async (label: string) => {
    const { groupId } = await createOrgGroup({ orgId: rootOrgId, label });
    createdGroupIds.push(groupId);
    await linkGroupToOrg({ groupId, authToken: subOrgToken });
    return groupId;
  };

  // A root member with a direct project row in the root project and in the sub-org project.
  const createRootUserWithProjects = async (label: string, groupIds: string[]) => {
    const { userId, username } = await createUser(label);
    createdUserIds.push(userId);
    await addUserMembership({ userId, orgId: rootOrgId, role: OrgMembershipRole.Member });
    await addUserMembership({ userId, orgId: rootOrgId, projectId: rootProjectId, role: ProjectMembershipRole.Member });
    await addUserMembership({
      userId,
      orgId: subOrgId,
      projectId: subOrgProjectId,
      role: ProjectMembershipRole.Member
    });
    await testDb(TableName.UserGroupMembership).insert(groupIds.map((groupId) => ({ userId, groupId })));
    return { userId, username };
  };

  beforeAll(async () => {
    const root = await createIsolatedOrgAndProject("org-access-reconcile");
    rootOrgId = root.orgId;
    rootProjectId = root.projectId;
    rootToken = root.authToken;
    cleanupRootOrg = root.cleanup;

    const sub = await createSubOrgAndProject({ rootOrgId, namePrefix: "org-access-reconcile-sub" });
    subOrgId = sub.subOrgId;
    subOrgProjectId = sub.projectId;
    subOrgToken = sub.authToken;
  });

  afterAll(async () => {
    for (const identityId of createdIdentityIds) {
      // eslint-disable-next-line no-await-in-loop
      await testServer.inject({
        method: "DELETE",
        url: `/api/v1/identities/${identityId}`,
        headers: { authorization: `Bearer ${rootToken}` }
      });
    }
    await deleteGroups(createdGroupIds);
    await deleteUsers(createdUserIds);
    await cleanupRootOrg();
  });

  test("a user removed from the group that reached the sub-org loses their sub-org project rows and keeps the root ones", async () => {
    const groupId = await createLinkedGroup("reconcile-grp");
    const { userId, username } = await createRootUserWithProjects("reconcile-user", [groupId]);

    await removeUserFromGroup({ groupId, username, authToken: rootToken });
    await reconcile();

    await pollUntil({
      describe: "the user's sub-org project membership to be revoked",
      read: () => projectRows(subOrgProjectId, { actorUserId: userId }),
      done: (rows) => rows.length === 0
    });
    expect(await projectRows(rootProjectId, { actorUserId: userId })).toHaveLength(1);
    expect(
      await testDb(TableName.Membership).where({
        scope: AccessScope.Organization,
        scopeOrgId: rootOrgId,
        actorUserId: userId
      })
    ).toHaveLength(1);
  });

  test("a user who still reaches the sub-org through another linked group keeps their project rows", async () => {
    const leftGroupId = await createLinkedGroup("reconcile-left");
    const keptGroupId = await createLinkedGroup("reconcile-kept");
    const { userId, username } = await createRootUserWithProjects("reconcile-two-paths", [leftGroupId, keptGroupId]);

    await removeUserFromGroup({ groupId: leftGroupId, username, authToken: rootToken });
    await reconcile();

    expect(await projectRows(subOrgProjectId, { actorUserId: userId })).toHaveLength(1);
    expect(await projectRows(rootProjectId, { actorUserId: userId })).toHaveLength(1);
  });

  test("unlinking the group from the sub-org revokes the members' direct project rows there", async () => {
    const groupId = await createLinkedGroup("reconcile-unlink");
    const { userId } = await createRootUserWithProjects("reconcile-unlink-user", [groupId]);

    await unlinkGroupFromOrg({ groupId, authToken: subOrgToken });
    await reconcile();

    await pollUntil({
      describe: "the unlinked group's member to lose their sub-org project membership",
      read: () => projectRows(subOrgProjectId, { actorUserId: userId }),
      done: (rows) => rows.length === 0
    });
    expect(await projectRows(rootProjectId, { actorUserId: userId })).toHaveLength(1);
  });

  test("a machine identity removed from the group loses its sub-org project row", async () => {
    const groupId = await createLinkedGroup("reconcile-identity-grp");
    const { identityId } = await createIdentityActor({ orgId: rootOrgId, authToken: rootToken });
    createdIdentityIds.push(identityId);
    await testDb(TableName.IdentityGroupMembership).insert({ identityId, groupId });
    await insertIdentityProjectRow({ orgId: subOrgId, projectId: subOrgProjectId, identityId });
    await insertIdentityProjectRow({ orgId: rootOrgId, projectId: rootProjectId, identityId });

    await removeIdentityFromGroup({ groupId, identityId, authToken: rootToken });
    await reconcile();

    await pollUntil({
      describe: "the identity's sub-org project membership to be revoked",
      read: () => projectRows(subOrgProjectId, { actorIdentityId: identityId }),
      done: (rows) => rows.length === 0
    });
    expect(await projectRows(rootProjectId, { actorIdentityId: identityId })).toHaveLength(1);
  });

  // The sweep's query is what backs the daily backstop, so it is checked against real rows: an actor
  // with a project row and no path into that org is an orphan, and every kind of path clears them.
  test("the sweep query finds an actor with a project row and no path into the org, and nothing else", async () => {
    const orgDAL = orgDALFactory(testDb);
    const groupId = await createLinkedGroup("reconcile-sweep-grp");

    const { userId: orphanUserId } = await createUser("reconcile-orphan");
    createdUserIds.push(orphanUserId);
    await addUserMembership({
      userId: orphanUserId,
      orgId: subOrgId,
      projectId: subOrgProjectId,
      role: ProjectMembershipRole.Member
    });

    const { userId: directUserId } = await createUser("reconcile-direct");
    createdUserIds.push(directUserId);
    await addUserMembership({ userId: directUserId, orgId: subOrgId, role: OrgMembershipRole.Member });
    await addUserMembership({
      userId: directUserId,
      orgId: subOrgId,
      projectId: subOrgProjectId,
      role: ProjectMembershipRole.Member
    });

    const { userId: viaGroupUserId } = await createRootUserWithProjects("reconcile-via-group", [groupId]);

    const orphans = await orgDAL.findOrphanedProjectActors({ limit: 100_000 });
    const orphanPairs = orphans.map((row) => `${row.actorUserId ?? row.actorIdentityId}:${row.scopeOrgId}`);

    expect(orphanPairs).toContain(`${orphanUserId}:${subOrgId}`);
    expect(orphanPairs).not.toContain(`${directUserId}:${subOrgId}`);
    expect(orphanPairs).not.toContain(`${viaGroupUserId}:${subOrgId}`);
    expect(orphanPairs).not.toContain(`${viaGroupUserId}:${rootOrgId}`);

    const withAccess = await orgDAL.findActorsWithOrgAccess({
      orgId: subOrgId,
      userIds: [orphanUserId, directUserId, viaGroupUserId],
      identityIds: []
    });
    expect([...withAccess.userIds].sort()).toEqual([directUserId, viaGroupUserId].sort());
  });
});
