import { randomUUID } from "node:crypto";

import { eventOutbox } from "e2e-test/fakes/event-outbox-queue";

import {
  AccessScope,
  OrgMembershipRole,
  ProjectMembershipRole,
  ProjectType,
  RESOURCE_SCOPE,
  ResourceMembershipRole,
  ResourceType,
  TableName
} from "@app/db/schemas";
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
import { addIdentityProjectMembership, addIdentityToProject, createIdentityActor } from "../../testUtils/identities";
import { pollUntil } from "../../testUtils/poll";
import {
  inviteUsersToProject,
  listAvailableProjectIdentities,
  listAvailableProjectUsers
} from "../../testUtils/project-members";
import { addUserMembership, createUser, deleteUsers } from "../../testUtils/users";

// A user reaches the sub-org only through a linked root group. Losing that path reaps their sub-org
// project rows and nothing else: a second path keeps them and the root org is never touched.
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

  // Drain, then wait out anything the relay claimed first, so "rows survived" checks run after the consumer.
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
    const groupId = await createOrgGroup({
      orgId: rootOrgId,
      name: `${label}-${randomUUID().slice(0, 8)}`,
      role: OrgMembershipRole.NoAccess
    });
    createdGroupIds.push(groupId);
    await linkGroupToOrg({ groupId, authToken: subOrgToken });
    return groupId;
  };

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
    await addIdentityProjectMembership({ identityId, orgId: subOrgId, projectId: subOrgProjectId });
    await addIdentityProjectMembership({ identityId, orgId: rootOrgId, projectId: rootProjectId });

    await removeIdentityFromGroup({ groupId, identityId, authToken: rootToken });
    await reconcile();

    await pollUntil({
      describe: "the identity's sub-org project membership to be revoked",
      read: () => projectRows(subOrgProjectId, { actorIdentityId: identityId }),
      done: (rows) => rows.length === 0
    });
    expect(await projectRows(rootProjectId, { actorIdentityId: identityId })).toHaveLength(1);
  });

  // Indirect members can be added to a sub-org project without becoming direct sub-org members, and lose it
  // once the group path goes.
  test("a user who reaches the sub-org only through a group can be added to its project", async () => {
    const groupId = await createLinkedGroup("assign-grp");
    const { userId, username } = await createUser("assign-user");
    createdUserIds.push(userId);
    await addUserMembership({ userId, orgId: rootOrgId, role: OrgMembershipRole.Member });
    await testDb(TableName.UserGroupMembership).insert({ userId, groupId });

    const available = await listAvailableProjectUsers({ projectId: subOrgProjectId, authToken: subOrgToken });
    expect(available.map((user) => user.id)).toContain(userId);

    await inviteUsersToProject({ projectId: subOrgProjectId, usernames: [username], authToken: subOrgToken }).expect(
      (res) => expect(res.statusCode).toBe(200)
    );

    expect(await projectRows(subOrgProjectId, { actorUserId: userId })).toHaveLength(1);
    expect(
      await testDb(TableName.Membership).where({
        scope: AccessScope.Organization,
        scopeOrgId: subOrgId,
        actorUserId: userId
      })
    ).toHaveLength(0);
    const afterAdd = await listAvailableProjectUsers({ projectId: subOrgProjectId, authToken: subOrgToken });
    expect(afterAdd.map((user) => user.id)).not.toContain(userId);

    await removeUserFromGroup({ groupId, username, authToken: rootToken });
    await reconcile();

    await pollUntil({
      describe: "the indirect member's project row to be revoked once the group path is gone",
      read: () => projectRows(subOrgProjectId, { actorUserId: userId }),
      done: (rows) => rows.length === 0
    });
  });

  test("a deactivated member is refused for a project by name, not as a non-member", async () => {
    const { userId, username } = await createUser("reconcile-deactivated");
    createdUserIds.push(userId);
    await addUserMembership({ userId, orgId: subOrgId, role: OrgMembershipRole.Member });
    await testDb(TableName.Membership)
      .where({ scope: AccessScope.Organization, scopeOrgId: subOrgId, actorUserId: userId })
      .update({ isActive: false });

    const available = await listAvailableProjectUsers({ projectId: subOrgProjectId, authToken: subOrgToken });
    expect(available.map((user) => user.id)).not.toContain(userId);

    await inviteUsersToProject({ projectId: subOrgProjectId, usernames: [username], authToken: subOrgToken }).expect(
      (res) => {
        expect(res.statusCode).toBe(400);
        expect(res.json().message).toBe(
          `'${username}' is deactivated in this organization. Reactivate them before adding them to this project.`
        );
      }
    );
    expect(await projectRows(subOrgProjectId, { actorUserId: userId })).toHaveLength(0);
  });

  test("a user with no path into the sub-org is not offered for its project", async () => {
    const { userId } = await createUser("assign-outsider");
    createdUserIds.push(userId);
    await addUserMembership({ userId, orgId: rootOrgId, role: OrgMembershipRole.Member });

    const available = await listAvailableProjectUsers({ projectId: subOrgProjectId, authToken: subOrgToken });
    expect(available.map((user) => user.id)).not.toContain(userId);
  });

  test("a machine identity that reaches the sub-org only through a group can be added to its project", async () => {
    const groupId = await createLinkedGroup("assign-identity-grp");
    const { identityId } = await createIdentityActor({ orgId: rootOrgId, authToken: rootToken });
    createdIdentityIds.push(identityId);
    await testDb(TableName.IdentityGroupMembership).insert({ identityId, groupId });

    const available = await listAvailableProjectIdentities({ projectId: subOrgProjectId, authToken: subOrgToken });
    expect(available.map((identity) => identity.id)).toContain(identityId);

    await addIdentityToProject({
      projectId: subOrgProjectId,
      identityId,
      role: ProjectMembershipRole.Member,
      authToken: subOrgToken
    });
    expect(await projectRows(subOrgProjectId, { actorIdentityId: identityId })).toHaveLength(1);
  });

  test("the available lists answer 404 for a project outside the caller's org", async () => {
    await listAvailableProjectUsers({ projectId: rootProjectId, authToken: subOrgToken }).expect((res) =>
      expect(res.statusCode).toBe(404)
    );
    await listAvailableProjectIdentities({ projectId: rootProjectId, authToken: subOrgToken }).expect((res) =>
      expect(res.statusCode).toBe(404)
    );
  });

  // PAM and Agent Vault have one implicit project per org and their own member routes.
  const asSubOrg = (method: "GET" | "POST", url: string, body?: Record<string, unknown>) =>
    testServer.inject({ method, url, headers: { authorization: `Bearer ${subOrgToken}` }, ...(body ? { body } : {}) });

  const implicitProjectId = async (product: "pam" | "agent-vault") => {
    const res = await asSubOrg("GET", `/api/v1/${product}/project`);
    expect(res.statusCode).toBe(200);
    return res.json().projectId as string;
  };

  test("PAM takes a group-only user and identity of the sub-org, and a root group linked into it", async () => {
    const groupId = await createLinkedGroup("pam-grp");
    const { userId, username } = await createUser("pam-user");
    createdUserIds.push(userId);
    await addUserMembership({ userId, orgId: rootOrgId, role: OrgMembershipRole.Member });
    await testDb(TableName.UserGroupMembership).insert({ userId, groupId });
    const { identityId } = await createIdentityActor({ orgId: rootOrgId, authToken: rootToken });
    createdIdentityIds.push(identityId);
    await testDb(TableName.IdentityGroupMembership).insert({ identityId, groupId });
    const pamProjectId = await implicitProjectId("pam");

    const available = await listAvailableProjectUsers({ projectId: pamProjectId, authToken: subOrgToken });
    expect(available.map((user) => user.id)).toContain(userId);

    const userRes = await asSubOrg("POST", "/api/v1/pam/memberships/users", { userIds: [userId], role: "member" });
    expect(userRes.statusCode).toBe(200);
    const identityRes = await asSubOrg("POST", `/api/v1/pam/memberships/identities/${identityId}`, { role: "member" });
    expect(identityRes.statusCode).toBe(200);
    const groupRes = await asSubOrg("POST", `/api/v1/pam/memberships/groups/${groupId}`, { role: "member" });
    expect(groupRes.statusCode).toBe(200);

    expect(await projectRows(pamProjectId, { actorUserId: userId })).toHaveLength(1);
    expect(await projectRows(pamProjectId, { actorIdentityId: identityId })).toHaveLength(1);

    await removeUserFromGroup({ groupId, username, authToken: rootToken });
    await reconcile();
    await pollUntil({
      describe: "the group-only PAM member to lose their membership once the group path is gone",
      read: () => projectRows(pamProjectId, { actorUserId: userId }),
      done: (rows) => rows.length === 0
    });
  });

  // Resource reads match a group's folder rows without checking the group still reaches the org, so the
  // unlink itself has to drop them; the consumer only handles users and identities.
  test("unlinking a group from the sub-org drops its PAM membership and folder grant there", async () => {
    const groupId = await createLinkedGroup("pam-unlink-grp");
    const pamProjectId = await implicitProjectId("pam");
    const join = await asSubOrg("POST", `/api/v1/organization-admin/projects/${pamProjectId}/grant-admin-access`);
    expect(join.statusCode, join.payload).toBe(200);

    const memberRes = await asSubOrg("POST", `/api/v1/pam/memberships/groups/${groupId}`, { role: "member" });
    expect(memberRes.statusCode, memberRes.payload).toBe(200);
    const folderRes = await asSubOrg("POST", "/api/v1/pam/folders", { name: `pam-unlink-${randomUUID().slice(0, 8)}` });
    expect(folderRes.statusCode, folderRes.payload).toBe(200);
    const folderId = folderRes.json().folder.id as string;
    const grantRes = await asSubOrg("POST", `/api/v1/pam/folders/${folderId}/groups/${groupId}`, { role: "operator" });
    expect(grantRes.statusCode, grantRes.payload).toBe(200);

    const groupRows = () => testDb(TableName.Membership).where({ scopeOrgId: subOrgId, actorGroupId: groupId });
    expect(await groupRows()).toHaveLength(3);

    await unlinkGroupFromOrg({ groupId, authToken: subOrgToken });

    expect(await groupRows()).toHaveLength(0);
    const listRes = await asSubOrg("GET", `/api/v1/pam/folders/${folderId}/groups`);
    expect(listRes.statusCode, listRes.payload).toBe(200);
    expect((listRes.json().members as { groupId?: string }[]).map((m) => m.groupId)).not.toContain(groupId);
  });

  // A lazily created Agent Vault project starts empty, so an org admin has to join it first.
  test("Agent Vault offers and takes a user who reaches the sub-org only through a group", async () => {
    const groupId = await createLinkedGroup("av-grp");
    const { userId } = await createUser("av-user");
    createdUserIds.push(userId);
    await addUserMembership({ userId, orgId: rootOrgId, role: OrgMembershipRole.Member });
    await testDb(TableName.UserGroupMembership).insert({ userId, groupId });
    const agentVaultProjectId = await implicitProjectId("agent-vault");
    const join = await asSubOrg(
      "POST",
      `/api/v1/organization-admin/projects/${agentVaultProjectId}/grant-admin-access`
    );
    expect(join.statusCode, join.payload).toBe(200);

    const availableRes = await asSubOrg("GET", "/api/v1/agent-vault/members/available?actorType=user&limit=100");
    expect(availableRes.statusCode, availableRes.payload).toBe(200);
    expect((availableRes.json().actors as { id: string }[]).map((actor) => actor.id)).toContain(userId);

    const addRes = await asSubOrg("POST", "/api/v1/agent-vault/members", { userIds: [userId], role: "member" });
    expect(addRes.statusCode, addRes.payload).toBe(200);
    expect(await projectRows(agentVaultProjectId, { actorUserId: userId })).toHaveLength(1);
  });

  test("Certificate Manager applications and signers take a user and identity that reach the sub-org only through a group", async () => {
    const groupId = await createLinkedGroup("pki-grp");
    const { userId, username } = await createUser("pki-user");
    createdUserIds.push(userId);
    await addUserMembership({ userId, orgId: rootOrgId, role: OrgMembershipRole.Member });
    await testDb(TableName.UserGroupMembership).insert({ userId, groupId });
    const { identityId } = await createIdentityActor({ orgId: rootOrgId, authToken: rootToken });
    createdIdentityIds.push(identityId);
    await testDb(TableName.IdentityGroupMembership).insert({ identityId, groupId });

    const projectRes = await asSubOrg("POST", "/api/v1/projects", {
      projectName: `pki-${randomUUID().slice(0, 8)}`,
      type: ProjectType.CertificateManager
    });
    expect(projectRes.statusCode).toBe(200);
    const certProjectId = projectRes.json().project.id as string;
    const [application] = await testDb(TableName.PkiApplication)
      .insert({ projectId: certProjectId, name: `pki-app-${randomUUID().slice(0, 8)}` })
      .returning("id");
    const [signer] = await testDb(TableName.PkiSigners)
      .insert({ projectId: certProjectId, name: `pki-signer-${randomUUID().slice(0, 8)}` })
      .returning("id");

    const userRes = await asSubOrg("POST", "/api/v1/cert-manager/access/users", { usernames: [username] });
    expect(userRes.statusCode).toBe(200);
    const identityRes = await asSubOrg("POST", `/api/v1/cert-manager/access/identities/${identityId}`, {});
    expect(identityRes.statusCode).toBe(200);

    const appUserRes = await asSubOrg("POST", `/api/v1/cert-manager/applications/${application.id}/users`, {
      userIds: [userId]
    });
    expect(appUserRes.statusCode).toBe(200);
    expect(appUserRes.json().unresolved).toEqual([]);
    const appIdentityRes = await asSubOrg(
      "POST",
      `/api/v1/cert-manager/applications/${application.id}/identities/${identityId}`,
      { role: ResourceMembershipRole.Operator }
    );
    expect(appIdentityRes.statusCode).toBe(200);

    const signerUserRes = await asSubOrg("POST", `/api/v1/cert-manager/signers/${signer.id}/users`, {
      userIds: [userId]
    });
    expect(signerUserRes.statusCode).toBe(200);
    const signerIdentityRes = await asSubOrg("POST", `/api/v1/cert-manager/signers/${signer.id}/identities`, {
      identityId
    });
    expect(signerIdentityRes.statusCode).toBe(200);

    const resourceRows = (actor: { actorUserId?: string; actorIdentityId?: string }) =>
      testDb(TableName.Membership).where({ scope: RESOURCE_SCOPE, scopeProjectId: certProjectId, ...actor });
    expect(await resourceRows({ actorUserId: userId })).toHaveLength(2);
    expect(await resourceRows({ actorIdentityId: identityId })).toHaveLength(2);
  });

  test("removing a member from the instance admin panel tears down their access like org member removal", async () => {
    const groupId = await createLinkedGroup("reconcile-admin-panel");
    const { userId } = await createRootUserWithProjects("reconcile-admin-panel-user", [groupId]);
    await addUserMembership({ userId, orgId: subOrgId, role: OrgMembershipRole.Member });
    await testDb(TableName.AdditionalPrivilege).insert({
      name: "reconcile-admin-panel-priv",
      actorUserId: userId,
      projectId: subOrgProjectId,
      permissions: JSON.stringify([])
    });
    const orgMembership = (await testDb(TableName.Membership)
      .where({ scope: AccessScope.Organization, scopeOrgId: rootOrgId, actorUserId: userId })
      .first("id")) as { id: string };

    // The seed user is the instance admin.
    const res = await testServer.inject({
      method: "DELETE",
      url: `/api/v1/admin/organization-management/organizations/${rootOrgId}/memberships/${orgMembership.id}`,
      headers: { authorization: `Bearer ${jwtAuthToken}` }
    });
    expect(res.statusCode).toBe(200);

    // Read from the DB because the API can't list a removed member's leftover rows: the teardown is synchronous,
    // so nothing may survive in either org, and the group no longer gives them a way back in.
    expect(await testDb(TableName.Membership).where({ actorUserId: userId })).toHaveLength(0);
    expect(await testDb(TableName.UserGroupMembership).where({ userId })).toHaveLength(0);
    expect(await testDb(TableName.AdditionalPrivilege).where({ actorUserId: userId })).toHaveLength(0);
    expect(
      await testDb(TableName.EventOutbox)
        .where({ consumer: ORG_ACCESS_RECONCILE_CONSUMER })
        .whereRaw(`payload->>'actorId' = ?`, [userId])
        .whereRaw(`payload->>'orgId' = ?`, [rootOrgId])
    ).toHaveLength(1);
  });

  // The sweep query, against real rows: a project or resource row with no path into the org is an orphan,
  // any path clears it. Resource-only rows (like a group-derived PAM admin's folder row) count too.
  test("the sweep query finds an actor with a project or resource row and no path into the org, and nothing else", async () => {
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

    const resourceRow = (actor: { actorUserId?: string; actorIdentityId?: string }, resourceType: ResourceType) => ({
      scope: RESOURCE_SCOPE,
      scopeOrgId: subOrgId,
      scopeProjectId: subOrgProjectId,
      scopeResourceType: resourceType,
      scopeResourceId: randomUUID(),
      ...actor
    });
    const { userId: resourceOnlyUserId } = await createUser("reconcile-resource-only");
    createdUserIds.push(resourceOnlyUserId);
    const { identityId: resourceOnlyIdentityId } = await createIdentityActor({
      orgId: rootOrgId,
      authToken: rootToken
    });
    createdIdentityIds.push(resourceOnlyIdentityId);
    await testDb(TableName.Membership).insert([
      resourceRow({ actorUserId: resourceOnlyUserId }, ResourceType.PamFolder),
      resourceRow({ actorIdentityId: resourceOnlyIdentityId }, ResourceType.AgentVaultAccessBundle),
      resourceRow({ actorUserId: viaGroupUserId }, ResourceType.PamFolder)
    ]);

    const orphans = await orgDAL.findOrphanedProjectActors({ limit: 100_000 });
    const orphanPairs = orphans.map((row) => `${row.actorUserId ?? row.actorIdentityId}:${row.scopeOrgId}`);

    expect(orphanPairs).toContain(`${orphanUserId}:${subOrgId}`);
    expect(orphanPairs).toContain(`${resourceOnlyUserId}:${subOrgId}`);
    expect(orphanPairs).toContain(`${resourceOnlyIdentityId}:${subOrgId}`);
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
