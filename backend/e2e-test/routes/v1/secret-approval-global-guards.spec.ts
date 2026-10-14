import crypto from "node:crypto";

import { createFolder, deleteFolder } from "e2e-test/testUtils/folders";
import { seedLegacySecretApprovalPolicy } from "e2e-test/testUtils/secret-approval-policies";
import { Knex } from "knex";

import { AccessScope, OrgMembershipRole, ProjectMembershipRole, TableName } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { ApproverType } from "@app/ee/services/access-approval-policy/access-approval-policy-types";
import { ApprovalPolicyType } from "@app/services/approval-policy/approval-policy-enums";

const getDb = () => (globalThis as unknown as { testDb: Knex }).testDb;

const projectId = seedData1.projectV3.id;
const orgId = seedData1.organization.id;
const envSlug = seedData1.environment.slug;
const authHeaders = () => ({ authorization: `Bearer ${jwtAuthToken}` });

const insertMembership = async (
  membership: { scope: AccessScope; scopeProjectId?: string; actorUserId?: string; actorGroupId?: string },
  role: string
) => {
  const [row] = await getDb()(TableName.Membership)
    .insert({ scopeOrgId: orgId, ...membership })
    .returning("id");
  const membershipId = (row as { id: string }).id;
  await getDb()(TableName.MembershipRole).insert({ membershipId, role });
  return membershipId;
};

const createProjectUser = async (label: string) => {
  const username = `${label}-${crypto.randomUUID()}@localhost.local`;
  const [user] = await getDb()(TableName.Users)
    .insert({ username, email: username, firstName: label, isAccepted: true, isGhost: false })
    .returning("id");
  const userId = (user as { id: string }).id;
  await insertMembership({ scope: AccessScope.Organization, actorUserId: userId }, OrgMembershipRole.Member);
  await insertMembership(
    { scope: AccessScope.Project, scopeProjectId: projectId, actorUserId: userId },
    ProjectMembershipRole.Member
  );
  return { userId, username };
};

const createProjectGroup = async (label: string) => {
  const slug = `${label}-${crypto.randomUUID().slice(0, 8)}`;
  const [group] = await getDb()(TableName.Groups).insert({ orgId, name: slug, slug }).returning("id");
  const groupId = (group as { id: string }).id;
  await insertMembership({ scope: AccessScope.Organization, actorGroupId: groupId }, OrgMembershipRole.NoAccess);
  await insertMembership(
    { scope: AccessScope.Project, scopeProjectId: projectId, actorGroupId: groupId },
    ProjectMembershipRole.Member
  );
  return groupId;
};

const createGlobalPolicy = async (name: string, secretPath: string, approver: { type: ApproverType; id: string }) => {
  const res = await testServer.inject({
    method: "POST",
    url: "/api/v2/secret-approvals",
    headers: authHeaders(),
    body: { projectId, environment: envSlug, secretPath, approvers: [approver], approvals: 1, name }
  });
  expect(res.statusCode).toBe(200);
  const policyId = (res.json() as { approval: { id: string } }).approval.id;
  expect(await getDb()(TableName.ApprovalPolicies).where({ id: policyId }).first()).toBeDefined();
  return policyId;
};

const replaceGlobalPolicyApprover = async (policyId: string, approver: { type: ApproverType; id: string }) => {
  const res = await testServer.inject({
    method: "PATCH",
    url: `/api/v2/secret-approvals/${policyId}`,
    headers: authHeaders(),
    body: { approvers: [approver], approvals: 1 }
  });
  expect(res.statusCode).toBe(200);
};

const deleteGlobalPolicy = async (policyId: string) => {
  const res = await testServer.inject({
    method: "DELETE",
    url: `/api/v2/secret-approvals/${policyId}`,
    headers: authHeaders()
  });
  expect(res.statusCode).toBe(200);
};

const removeProjectUser = (username: string) =>
  testServer.inject({
    method: "DELETE",
    url: `/api/v1/projects/${projectId}/memberships`,
    headers: authHeaders(),
    body: { usernames: [username] }
  });

const removeProjectGroup = (groupId: string) =>
  testServer.inject({
    method: "DELETE",
    url: `/api/v1/projects/${projectId}/memberships/groups/${groupId}`,
    headers: authHeaders()
  });

const deleteFolderRequest = (folderId: string, secretPath: string) =>
  testServer.inject({
    method: "DELETE",
    url: `/api/v1/folders/${folderId}`,
    headers: authHeaders(),
    body: { workspaceId: projectId, environment: envSlug, path: secretPath, forceDelete: true }
  });

const seedOpenSecretChangeRequest = async (folderId: string) => {
  const [request] = await getDb()(TableName.ApprovalRequests)
    .insert({
      projectId,
      organizationId: orgId,
      policyId: null,
      requesterId: seedData1.id,
      requesterName: "test",
      requesterEmail: seedData1.email,
      type: ApprovalPolicyType.SecretChange,
      status: "open",
      currentStep: 0,
      requestData: JSON.stringify({})
    })
    .returning("id");
  const approvalRequestId = (request as { id: string }).id;
  await getDb()(TableName.SecretChangeRequests).insert({
    approvalRequestId,
    folderId,
    slug: `guard-${crypto.randomUUID().slice(0, 8)}`
  });
  return approvalRequestId;
};

const seedOpenRequestWithApprover = async (folderId: string, approver: { userId?: string; groupId?: string }) => {
  const slug = `guard-${crypto.randomUUID().slice(0, 8)}`;
  const [request] = await getDb()(TableName.ApprovalRequests)
    .insert({
      projectId,
      organizationId: orgId,
      policyId: null,
      requesterId: seedData1.id,
      requesterName: "test",
      requesterEmail: seedData1.email,
      type: ApprovalPolicyType.SecretChange,
      status: "open",
      currentStep: 1,
      requestData: JSON.stringify({})
    })
    .returning("id");
  const approvalRequestId = (request as { id: string }).id;
  const [step] = await getDb()(TableName.ApprovalRequestSteps)
    .insert({
      requestId: approvalRequestId,
      stepNumber: 1,
      status: "in-progress",
      requiredApprovals: 1
    })
    .returning("id");
  await getDb()(TableName.ApprovalRequestStepEligibleApprovers).insert({
    stepId: (step as { id: string }).id,
    userId: approver.userId ?? null,
    groupId: approver.groupId ?? null
  });
  await getDb()(TableName.SecretChangeRequests).insert({
    approvalRequestId,
    folderId,
    slug
  });
  return { approvalRequestId, slug };
};

const seedOpenLegacyRequest = async (folderId: string, policyId: string) => {
  const [request] = await getDb()(TableName.SecretApprovalRequest)
    .insert({
      policyId,
      folderId,
      slug: `guard-${crypto.randomUUID().slice(0, 8)}`,
      status: "open",
      committerUserId: seedData1.id
    })
    .returning("id");
  return (request as { id: string }).id;
};

const createFolderTree = async () => {
  const parentName = `folder-guard-${crypto.randomUUID().slice(0, 8)}`;
  const parent = await createFolder({
    workspaceId: projectId,
    environmentSlug: envSlug,
    secretPath: "/",
    name: parentName,
    authToken: jwtAuthToken
  });
  const child = await createFolder({
    workspaceId: projectId,
    environmentSlug: envSlug,
    secretPath: `/${parentName}`,
    name: "child",
    authToken: jwtAuthToken
  });
  return { parentName, parent, child };
};

const openRequestMessage = (folderPath: string) =>
  `You cannot delete the selected folder because it has open change requests at folder path "${folderPath}". Merge or close the change requests and try again.`;

describe("Global approval system guards outside the approval routes", () => {
  const userIds: string[] = [];
  const groupIds: string[] = [];
  const policyIds: string[] = [];
  const requestIds: string[] = [];
  const legacyPolicyIds: string[] = [];
  const legacyRequestIds: string[] = [];

  afterAll(async () => {
    const db = getDb();
    await db(TableName.ApprovalRequests).whereIn("id", requestIds).del();
    await db(TableName.ApprovalPolicies).whereIn("id", policyIds).del();
    await db(TableName.SecretApprovalRequest).whereIn("id", legacyRequestIds).del();
    await db(TableName.SecretApprovalPolicy).whereIn("id", legacyPolicyIds).del();
    await db(TableName.Membership).whereIn("actorUserId", userIds).del();
    await db(TableName.Membership).whereIn("actorGroupId", groupIds).del();
    await db(TableName.Groups).whereIn("id", groupIds).del();
    await db(TableName.Users).whereIn("id", userIds).del();
  });

  test("a user who approves a global policy cannot be removed from the project until the policy is gone", async () => {
    const { userId, username } = await createProjectUser("global-approver");
    userIds.push(userId);
    const policyId = await createGlobalPolicy("global-user-guard", "/global-user-guard", {
      type: ApproverType.User,
      id: userId
    });
    policyIds.push(policyId);

    const blocked = await removeProjectUser(username);
    expect(blocked.statusCode).toBe(400);
    expect(blocked.json().message).toBe(
      "Cannot remove user from project: user is an approver in secret approval policy: global-user-guard"
    );

    await deleteGlobalPolicy(policyId);

    const removed = await removeProjectUser(username);
    expect(removed.statusCode).toBe(200);
  });

  test("a group that approves a global policy cannot be removed from the project until the policy is gone", async () => {
    const groupId = await createProjectGroup("global-approver-group");
    groupIds.push(groupId);
    const policyId = await createGlobalPolicy("global-group-guard", "/global-group-guard", {
      type: ApproverType.Group,
      id: groupId
    });
    policyIds.push(policyId);

    const blocked = await removeProjectGroup(groupId);
    expect(blocked.statusCode).toBe(400);
    expect(blocked.json().message).toBe(
      "Cannot remove group from project: group is an approver in secret approval policy: global-group-guard"
    );

    await deleteGlobalPolicy(policyId);

    const removed = await removeProjectGroup(groupId);
    expect(removed.statusCode).toBe(200);
  });

  test("a user saved on an open request cannot be removed after the policy approver changes", async () => {
    const { userId, username } = await createProjectUser("open-request-approver");
    userIds.push(userId);
    const folderName = `open-request-user-${crypto.randomUUID().slice(0, 8)}`;
    const folder = await createFolder({
      workspaceId: projectId,
      environmentSlug: envSlug,
      secretPath: "/",
      name: folderName,
      authToken: jwtAuthToken
    });
    const policyId = await createGlobalPolicy("open-request-user-guard", `/${folderName}`, {
      type: ApproverType.User,
      id: userId
    });
    policyIds.push(policyId);
    const { approvalRequestId, slug } = await seedOpenRequestWithApprover(folder.id, { userId });
    requestIds.push(approvalRequestId);

    await replaceGlobalPolicyApprover(policyId, { type: ApproverType.User, id: seedData1.id });

    const blocked = await removeProjectUser(username);
    expect(blocked.statusCode).toBe(400);
    expect(blocked.json().message).toBe(
      `Cannot remove user from project: user is an approver on open secret approval request: ${slug}`
    );

    await getDb()(TableName.ApprovalRequests).where({ id: approvalRequestId }).update({ status: "close" });

    const removed = await removeProjectUser(username);
    expect(removed.statusCode).toBe(200);

    await deleteFolder({
      workspaceId: projectId,
      environmentSlug: envSlug,
      secretPath: "/",
      id: folder.id,
      authToken: jwtAuthToken
    });
  });

  test("a group saved on an open request cannot be removed after the policy approver changes", async () => {
    const groupId = await createProjectGroup("open-request-approver-group");
    groupIds.push(groupId);
    const folderName = `open-request-group-${crypto.randomUUID().slice(0, 8)}`;
    const folder = await createFolder({
      workspaceId: projectId,
      environmentSlug: envSlug,
      secretPath: "/",
      name: folderName,
      authToken: jwtAuthToken
    });
    const policyId = await createGlobalPolicy("open-request-group-guard", `/${folderName}`, {
      type: ApproverType.Group,
      id: groupId
    });
    policyIds.push(policyId);
    const { approvalRequestId, slug } = await seedOpenRequestWithApprover(folder.id, { groupId });
    requestIds.push(approvalRequestId);

    await replaceGlobalPolicyApprover(policyId, { type: ApproverType.User, id: seedData1.id });

    const blocked = await removeProjectGroup(groupId);
    expect(blocked.statusCode).toBe(400);
    expect(blocked.json().message).toBe(
      `Cannot remove group from project: group is an approver on open secret approval request: ${slug}`
    );

    await getDb()(TableName.ApprovalRequests).where({ id: approvalRequestId }).update({ status: "close" });

    const removed = await removeProjectGroup(groupId);
    expect(removed.statusCode).toBe(200);

    await deleteFolder({
      workspaceId: projectId,
      environmentSlug: envSlug,
      secretPath: "/",
      id: folder.id,
      authToken: jwtAuthToken
    });
  });

  test("a folder with an open global change request cannot be deleted, directly or through its parent", async () => {
    const { parentName, parent, child } = await createFolderTree();
    const requestId = await seedOpenSecretChangeRequest(child.id);
    requestIds.push(requestId);

    const expectedMessage = openRequestMessage(`/${parentName}/child`);

    const childBlocked = await deleteFolderRequest(child.id, `/${parentName}`);
    expect(childBlocked.statusCode).toBe(400);
    expect(childBlocked.json().message).toBe(expectedMessage);

    const parentBlocked = await deleteFolderRequest(parent.id, "/");
    expect(parentBlocked.statusCode).toBe(400);
    expect(parentBlocked.json().message).toBe(expectedMessage);

    expect(await getDb()(TableName.SecretFolder).where({ id: child.id }).first()).toBeDefined();

    await getDb()(TableName.ApprovalRequests).where({ id: requestId }).update({ status: "close" });

    await deleteFolder({
      workspaceId: projectId,
      environmentSlug: envSlug,
      secretPath: "/",
      id: parent.id,
      authToken: jwtAuthToken,
      forceDelete: true
    });
    expect(await getDb()(TableName.SecretFolder).where({ id: child.id }).first()).toBeUndefined();
  });

  test("a folder with an open legacy change request cannot be deleted until the request is closed", async () => {
    const { parentName, parent, child } = await createFolderTree();
    const legacyPolicy = await seedLegacySecretApprovalPolicy(getDb(), {
      projectId,
      environment: envSlug,
      secretPath: `/${parentName}/child`,
      name: "legacy-folder-guard",
      approverUserId: seedData1.id
    });
    legacyPolicyIds.push(legacyPolicy.id);
    const legacyRequestId = await seedOpenLegacyRequest(child.id, legacyPolicy.id);
    legacyRequestIds.push(legacyRequestId);

    const blocked = await deleteFolderRequest(parent.id, "/");
    expect(blocked.statusCode).toBe(400);
    expect(blocked.json().message).toBe(openRequestMessage(`/${parentName}/child`));

    await getDb()(TableName.SecretApprovalRequest).where({ id: legacyRequestId }).update({ status: "close" });

    await deleteFolder({
      workspaceId: projectId,
      environmentSlug: envSlug,
      secretPath: "/",
      id: parent.id,
      authToken: jwtAuthToken,
      forceDelete: true
    });
    expect(await getDb()(TableName.SecretFolder).where({ id: child.id }).first()).toBeUndefined();
  });
});
