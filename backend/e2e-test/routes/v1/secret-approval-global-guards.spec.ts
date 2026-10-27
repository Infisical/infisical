import crypto from "node:crypto";

import { createFolder, deleteFolder } from "e2e-test/testUtils/folders";
import { seedLegacySecretApprovalPolicy } from "e2e-test/testUtils/secret-approval-policies";
import { Knex } from "knex";

import { TableName } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";

const getDb = () => (globalThis as unknown as { testDb: Knex }).testDb;

const projectId = seedData1.projectV3.id;
const envSlug = seedData1.environment.slug;
const authHeaders = () => ({ authorization: `Bearer ${jwtAuthToken}` });

const deleteFolderRequest = (folderId: string, secretPath: string) =>
  testServer.inject({
    method: "DELETE",
    url: `/api/v1/folders/${folderId}`,
    headers: authHeaders(),
    body: { workspaceId: projectId, environment: envSlug, path: secretPath, forceDelete: true }
  });

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
  const legacyPolicyIds: string[] = [];
  const legacyRequestIds: string[] = [];

  afterAll(async () => {
    const db = getDb();
    await db(TableName.SecretApprovalRequest).whereIn("id", legacyRequestIds).del();
    await db(TableName.SecretApprovalPolicy).whereIn("id", legacyPolicyIds).del();
  });

  test("a user who approves a migrated policy's legacy twin is removable once the global policy drops them", async () => {
    const { userId, username } = await createProjectUser("migrated-approver");
    userIds.push(userId);
    const policyId = await createGlobalPolicy("migrated-user-guard", "/migrated-user-guard", {
      type: ApproverType.User,
      id: userId
    });
    policyIds.push(policyId);
    await seedLegacySecretApprovalPolicy(getDb(), {
      id: policyId,
      projectId,
      environment: envSlug,
      secretPath: "/migrated-user-guard",
      name: "migrated-user-guard",
      approverUserId: userId
    });
    legacyPolicyIds.push(policyId);

    const blocked = await removeProjectUser(username);
    expect(blocked.statusCode).toBe(400);

    await replaceGlobalPolicyApprover(policyId, { type: ApproverType.User, id: seedData1.id });

    const removed = await removeProjectUser(username);
    expect(removed.statusCode).toBe(200);
  });

  test("a folder whose open legacy request was migrated is deletable once the global copy closes", async () => {
    const { parentName, parent, child } = await createFolderTree();
    const legacyPolicy = await seedLegacySecretApprovalPolicy(getDb(), {
      projectId,
      environment: envSlug,
      secretPath: `/${parentName}/child`,
      name: "migrated-folder-guard",
      approverUserId: seedData1.id
    });
    legacyPolicyIds.push(legacyPolicy.id);
    const requestId = await seedOpenLegacyRequest(child.id, legacyPolicy.id);
    legacyRequestIds.push(requestId);
    const globalTwin = {
      id: requestId,
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
    };
    await getDb()(TableName.ApprovalRequests).insert(globalTwin);
    await getDb()(TableName.SecretChangeRequests).insert({
      approvalRequestId: requestId,
      folderId: child.id,
      slug: `guard-${crypto.randomUUID().slice(0, 8)}`
    });
    requestIds.push(requestId);

    const blocked = await deleteFolderRequest(parent.id, "/");
    expect(blocked.statusCode).toBe(400);
    expect(blocked.json().message).toBe(openRequestMessage(`/${parentName}/child`));

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
