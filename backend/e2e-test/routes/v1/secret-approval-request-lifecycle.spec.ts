import { createFolder, deleteFolder } from "e2e-test/testUtils/folders";
import { Knex } from "knex";

import { SecretType, TableName } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { ApproverType } from "@app/ee/services/access-approval-policy/access-approval-policy-types";
import { ApprovalStatus, RequestState } from "@app/ee/services/secret-approval-request/secret-approval-request-types";
import {
  ApprovalPolicyType,
  ApprovalRequestStatus,
  ApprovalRequestStepStatus
} from "@app/services/approval-policy/approval-policy-enums";
import { SecretOperations } from "@app/services/secret/secret-types";

const getDb = () => (globalThis as unknown as { testDb: Knex }).testDb;

const BRIDGE_MESSAGE = "Secret change requests on the approval system are not available yet.";
const projectId = seedData1.projectV3.id;
const envSlug = seedData1.environment.slug;
const BASE_KEY = "LIFECYCLE_BASE";
const NEW_KEY = "LIFECYCLE_NEW";
const authHeaders = () => ({ authorization: `Bearer ${jwtAuthToken}` });
const approvers = [{ type: ApproverType.User, id: seedData1.id }];

const secretBody = (secretPath: string) => ({ projectId, environment: envSlug, secretPath });

const createSecret = (secretPath: string, key: string, value: string) =>
  testServer.inject({
    method: "POST",
    url: `/api/v4/secrets/${key}`,
    headers: authHeaders(),
    body: { ...secretBody(secretPath), type: SecretType.Shared, secretKey: key, secretValue: value }
  });

const updateSecret = (secretPath: string, key: string, value: string) =>
  testServer.inject({
    method: "PATCH",
    url: `/api/v4/secrets/${key}`,
    headers: authHeaders(),
    body: { ...secretBody(secretPath), secretValue: value }
  });

const deleteSecret = (secretPath: string, key: string) =>
  testServer.inject({
    method: "DELETE",
    url: `/api/v4/secrets/${key}`,
    headers: authHeaders(),
    body: secretBody(secretPath)
  });

const getSecret = (secretPath: string, key: string) =>
  testServer.inject({
    method: "GET",
    url: `/api/v4/secrets/${key}?projectId=${projectId}&environment=${envSlug}&secretPath=${encodeURIComponent(secretPath)}`,
    headers: authHeaders()
  });

const createPolicy = (url: string, secretPath: string, name: string) =>
  testServer.inject({
    method: "POST",
    url,
    headers: authHeaders(),
    body: { workspaceId: projectId, projectId, environment: envSlug, secretPath, approvers, approvals: 1, name }
  });

const getRequest = (id: string) =>
  testServer.inject({ method: "GET", url: `/api/v1/secret-approval-requests/${id}`, headers: authHeaders() });

const reviewRequest = (id: string, status: ApprovalStatus) =>
  testServer.inject({
    method: "POST",
    url: `/api/v1/secret-approval-requests/${id}/review`,
    headers: authHeaders(),
    body: { status }
  });

const mergeRequest = (id: string) =>
  testServer.inject({
    method: "POST",
    url: `/api/v1/secret-approval-requests/${id}/merge`,
    headers: authHeaders(),
    body: {}
  });

const setupFolderWithBaseSecret = async (folderName: string) => {
  const folder = await createFolder({
    workspaceId: projectId,
    environmentSlug: envSlug,
    secretPath: "/",
    name: folderName,
    authToken: jwtAuthToken
  });
  const secretPath = `/${folderName}`;
  const createRes = await createSecret(secretPath, BASE_KEY, "base");
  expect(createRes.statusCode).toBe(200);
  expect(createRes.json().approval).toBeUndefined();
  const baseSecretId = createRes.json().secret.id as string;
  const baseVersion = await getDb()(TableName.SecretVersionV2)
    .where({ secretId: baseSecretId })
    .orderBy("version", "desc")
    .first();
  if (!baseVersion) throw new Error("base secret version not found");
  return { folderId: folder.id, secretPath, baseSecretId, baseVersion };
};

const teardownFolder = (folderId: string) =>
  deleteFolder({
    workspaceId: projectId,
    environmentSlug: envSlug,
    secretPath: "/",
    id: folderId,
    authToken: jwtAuthToken,
    forceDelete: true
  });

describe("Secret change request lifecycle on a policy on the global approval system", () => {
  const FOLDER = "sar-lifecycle-global";
  let folderId: string;
  let secretPath: string;
  let baseSecretId: string;
  let baseVersion: { id: string; version: number };
  let policyId: string;
  const requestIds: string[] = [];

  beforeAll(async () => {
    ({ folderId, secretPath, baseSecretId, baseVersion } = await setupFolderWithBaseSecret(FOLDER));
    const policyRes = await createPolicy("/api/v2/secret-approvals", secretPath, "lifecycle-global-policy");
    expect(policyRes.statusCode).toBe(200);
    policyId = policyRes.json().approval.id as string;
  });

  afterAll(async () => {
    const db = getDb();
    await db(TableName.ApprovalRequests).whereIn("id", requestIds).del();
    await db(TableName.ApprovalPolicies).where({ id: policyId }).del();
    await teardownFolder(folderId);
  });

  const expectOpenRequest = async (approval: { id: string; slug: string }, commit: Record<string, unknown>) => {
    const db = getDb();
    requestIds.push(approval.id);

    expect(approval).toMatchObject({
      policyId,
      status: RequestState.Open,
      hasMerged: false,
      folderId,
      committerUserId: seedData1.id
    });

    expect(await db(TableName.ApprovalRequests).where({ id: approval.id }).first()).toMatchObject({
      type: ApprovalPolicyType.SecretChange,
      status: ApprovalRequestStatus.Open,
      policyId,
      requesterId: seedData1.id,
      requesterEmail: seedData1.email,
      currentStep: 1
    });
    expect(await db(TableName.SecretApprovalRequest).where({ id: approval.id }).first()).toBeUndefined();

    const change = await db(TableName.SecretChangeRequests).where({ approvalRequestId: approval.id }).first();
    expect(change).toMatchObject({ slug: approval.slug, folderId, hasMerged: false });

    const steps = await db(TableName.ApprovalRequestSteps).where({ requestId: approval.id });
    expect(steps).toMatchObject([
      { stepNumber: 1, requiredApprovals: 1, status: ApprovalRequestStepStatus.InProgress }
    ]);
    expect(await db(TableName.ApprovalRequestStepEligibleApprovers).where({ stepId: steps[0].id })).toMatchObject([
      { userId: seedData1.id, groupId: null }
    ]);

    const commits = await db(TableName.SecretApprovalRequestSecretV2).where({ secretChangeId: change?.id });
    expect(commits).toHaveLength(1);
    expect(commits[0]).toMatchObject({ requestId: null, ...commit });
    return commits[0];
  };

  test("creating a secret opens a request with a create commit", async () => {
    const res = await createSecret(secretPath, NEW_KEY, "value");
    expect(res.statusCode).toBe(200);

    const commit = await expectOpenRequest(res.json().approval, {
      op: SecretOperations.Create,
      key: NEW_KEY,
      version: 1,
      secretId: null,
      secretVersion: null
    });
    expect(commit.encryptedValue).not.toBeNull();
    expect((await getSecret(secretPath, NEW_KEY)).statusCode).toBe(404);
  });

  test("updating a secret opens a request with an update commit pointing at the live secret", async () => {
    const res = await updateSecret(secretPath, BASE_KEY, "changed");
    expect(res.statusCode).toBe(200);

    const commit = await expectOpenRequest(res.json().approval, {
      op: SecretOperations.Update,
      key: BASE_KEY,
      secretId: baseSecretId,
      secretVersion: baseVersion.id,
      version: baseVersion.version
    });
    expect(commit.encryptedValue).not.toBeNull();
    expect((await getSecret(secretPath, BASE_KEY)).json().secret.secretValue).toBe("base");
  });

  test("deleting a secret opens a request with a delete commit and leaves the secret in place", async () => {
    const res = await deleteSecret(secretPath, BASE_KEY);
    expect(res.statusCode).toBe(200);

    await expectOpenRequest(res.json().approval, {
      op: SecretOperations.Delete,
      key: BASE_KEY,
      secretId: baseSecretId,
      secretVersion: baseVersion.id
    });
    expect((await getSecret(secretPath, BASE_KEY)).statusCode).toBe(200);
  });

  test("reviewing, merging and closing are refused until the bridge supports them", async () => {
    expect(requestIds).toHaveLength(3);

    for await (const requestId of requestIds) {
      const responses = await Promise.all([
        getRequest(requestId),
        reviewRequest(requestId, ApprovalStatus.APPROVED),
        mergeRequest(requestId)
      ]);
      for (const res of responses) {
        expect(res.statusCode).toBe(400);
        expect(res.json().message).toBe(BRIDGE_MESSAGE);
      }

      expect(await getDb()(TableName.ApprovalRequests).where({ id: requestId }).first()).toMatchObject({
        status: ApprovalRequestStatus.Open
      });
      expect(await getDb()(TableName.ApprovalRequestApprovals).count("* as count").first()).toMatchObject({
        count: "0"
      });
    }
  });
});

describe("Secret approval request lifecycle on a policy on the legacy approval system", () => {
  const FOLDER = "sar-lifecycle-legacy";
  let folderId: string;
  let secretPath: string;
  let baseSecretId: string;
  let baseVersion: { id: string; version: number };
  let policyId: string;
  const requestIds: string[] = [];

  beforeAll(async () => {
    ({ folderId, secretPath, baseSecretId, baseVersion } = await setupFolderWithBaseSecret(FOLDER));
    const policyRes = await createPolicy("/api/v1/secret-approvals", secretPath, "lifecycle-legacy-policy");
    expect(policyRes.statusCode).toBe(200);
    policyId = policyRes.json().approval.id as string;
  });

  afterAll(async () => {
    const db = getDb();
    await db(TableName.SecretApprovalRequest).whereIn("id", requestIds).del();
    await db(TableName.SecretApprovalPolicy).where({ id: policyId }).del();
    await teardownFolder(folderId);
  });

  const expectOpenRequest = async (approval: { id: string; slug: string }, commit: Record<string, unknown>) => {
    const db = getDb();
    requestIds.push(approval.id);

    expect(approval).toMatchObject({
      policyId,
      status: RequestState.Open,
      hasMerged: false,
      folderId,
      committerUserId: seedData1.id
    });

    expect(await db(TableName.SecretApprovalRequest).where({ id: approval.id }).first()).toMatchObject({
      policyId,
      status: RequestState.Open,
      hasMerged: false,
      folderId,
      slug: approval.slug,
      committerUserId: seedData1.id
    });
    expect(await db(TableName.ApprovalRequests).where({ id: approval.id }).first()).toBeUndefined();

    const commits = await db(TableName.SecretApprovalRequestSecretV2).where({ requestId: approval.id });
    expect(commits).toHaveLength(1);
    expect(commits[0]).toMatchObject({ secretChangeId: null, ...commit });
    return commits[0];
  };

  test("creating a secret opens a request with a create commit", async () => {
    const res = await createSecret(secretPath, NEW_KEY, "value");
    expect(res.statusCode).toBe(200);

    const commit = await expectOpenRequest(res.json().approval, {
      op: SecretOperations.Create,
      key: NEW_KEY,
      version: 1,
      secretId: null,
      secretVersion: null
    });
    expect(commit.encryptedValue).not.toBeNull();
    expect((await getSecret(secretPath, NEW_KEY)).statusCode).toBe(404);
  });

  test("updating a secret opens a request with an update commit pointing at the live secret", async () => {
    const res = await updateSecret(secretPath, BASE_KEY, "changed");
    expect(res.statusCode).toBe(200);

    await expectOpenRequest(res.json().approval, {
      op: SecretOperations.Update,
      key: BASE_KEY,
      secretId: baseSecretId,
      secretVersion: baseVersion.id,
      version: baseVersion.version
    });
    expect((await getSecret(secretPath, BASE_KEY)).json().secret.secretValue).toBe("base");
  });

  test("deleting a secret opens a request with a delete commit and leaves the secret in place", async () => {
    const res = await deleteSecret(secretPath, BASE_KEY);
    expect(res.statusCode).toBe(200);

    await expectOpenRequest(res.json().approval, {
      op: SecretOperations.Delete,
      key: BASE_KEY,
      secretId: baseSecretId,
      secretVersion: baseVersion.id
    });
    expect((await getSecret(secretPath, BASE_KEY)).statusCode).toBe(200);
  });

  test("each request can be approved and stays open until it is merged", async () => {
    expect(requestIds).toHaveLength(3);

    for await (const requestId of requestIds) {
      const reviewRes = await reviewRequest(requestId, ApprovalStatus.APPROVED);
      expect(reviewRes.statusCode).toBe(200);
      expect(reviewRes.json().review).toMatchObject({
        requestId,
        reviewerUserId: seedData1.id,
        status: ApprovalStatus.APPROVED
      });

      expect(await getDb()(TableName.SecretApprovalRequestReviewer).where({ requestId })).toMatchObject([
        { reviewerUserId: seedData1.id, status: ApprovalStatus.APPROVED }
      ]);
      expect(await getDb()(TableName.SecretApprovalRequest).where({ id: requestId }).first()).toMatchObject({
        status: RequestState.Open,
        hasMerged: false
      });

      const detailsRes = await getRequest(requestId);
      expect(detailsRes.statusCode).toBe(200);
      expect(detailsRes.json().approval.reviewers).toMatchObject([
        { userId: seedData1.id, status: ApprovalStatus.APPROVED }
      ]);
    }
  });

  test("merging the approved create request closes it and creates the secret", async () => {
    const [createRequestId] = requestIds;

    const mergeRes = await mergeRequest(createRequestId);
    expect(mergeRes.statusCode).toBe(200);
    expect(mergeRes.json().approval).toMatchObject({ hasMerged: true, status: RequestState.Closed });

    expect(await getDb()(TableName.SecretApprovalRequest).where({ id: createRequestId }).first()).toMatchObject({
      status: RequestState.Closed,
      hasMerged: true,
      statusChangedByUserId: seedData1.id
    });

    const secretRes = await getSecret(secretPath, NEW_KEY);
    expect(secretRes.statusCode).toBe(200);
    expect(secretRes.json().secret.secretValue).toBe("value");
  });
});
