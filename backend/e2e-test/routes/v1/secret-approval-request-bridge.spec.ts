import { createFolder, deleteFolder } from "e2e-test/testUtils/folders";
import { Knex } from "knex";

import { SecretType, TableName } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { ApproverType } from "@app/ee/services/access-approval-policy/access-approval-policy-types";
import { ApprovalStatus, RequestState } from "@app/ee/services/secret-approval-request/secret-approval-request-types";
import { ApprovalPolicyType, ApprovalRequestStatus } from "@app/services/approval-policy/approval-policy-enums";

const getDb = () => (globalThis as unknown as { testDb: Knex }).testDb;

const BRIDGE_MESSAGE = "Secret change requests on the approval system are not available yet.";
const projectId = seedData1.projectV3.id;
const envSlug = seedData1.environment.slug;
const NEW_SYSTEM_FOLDER = "sar-bridge-new";
const NEW_SYSTEM_PATH = `/${NEW_SYSTEM_FOLDER}`;
const authHeaders = () => ({ authorization: `Bearer ${jwtAuthToken}` });

const createSecret = (key: string, value: string, secretPath = "/") =>
  testServer.inject({
    method: "POST",
    url: `/api/v4/secrets/${key}`,
    headers: authHeaders(),
    body: {
      projectId,
      environment: envSlug,
      secretPath,
      type: SecretType.Shared,
      secretKey: key,
      secretValue: value
    }
  });

const deleteSecret = (key: string, secretPath = "/") =>
  testServer.inject({
    method: "DELETE",
    url: `/api/v4/secrets/${key}`,
    headers: authHeaders(),
    body: { projectId, environment: envSlug, secretPath }
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

const setRequestStatus = (id: string, status: RequestState) =>
  testServer.inject({
    method: "POST",
    url: `/api/v1/secret-approval-requests/${id}/status`,
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

const seedLegacyPolicy = async (db: Knex) => {
  const env = await db(TableName.Environment).where({ projectId, slug: seedData1.environment.slug }).first();
  if (!env) throw new Error("seeded environment not found");

  const [policy] = await db(TableName.SecretApprovalPolicy)
    .insert({
      name: "legacy-bridge-test-policy",
      secretPath: "/",
      approvals: 1,
      envId: env.id,
      enforcementLevel: "hard",
      bypassForMachineIdentities: false
    })
    .returning("*");
  await db(TableName.SecretApprovalPolicyEnvironment).insert({ policyId: policy.id, envId: env.id });
  await db(TableName.SecretApprovalPolicyApprover).insert({ policyId: policy.id, approverUserId: seedData1.id });
  return policy;
};

const createNewSystemPolicy = async () => {
  const res = await testServer.inject({
    method: "POST",
    url: "/api/v2/secret-approvals",
    headers: authHeaders(),
    body: {
      projectId,
      environment: envSlug,
      secretPath: NEW_SYSTEM_PATH,
      approvers: [{ type: ApproverType.User, id: seedData1.id }],
      approvals: 1,
      name: "new-system-bridge-test-policy"
    }
  });
  expect(res.statusCode).toBe(200);
  return res.json().approval.id as string;
};

describe("Secret approval request bridge routing", () => {
  let legacyPolicyId: string;
  let newSystemPolicyId: string;
  let newSystemFolderId: string;
  const newSystemRequestIds: string[] = [];
  const secretKeys = ["SAR_BRIDGE_MERGE", "SAR_BRIDGE_STATUS"];

  beforeAll(async () => {
    const db = getDb();
    legacyPolicyId = (await seedLegacyPolicy(db)).id;
    newSystemFolderId = (
      await createFolder({
        workspaceId: projectId,
        environmentSlug: envSlug,
        secretPath: "/",
        name: NEW_SYSTEM_FOLDER,
        authToken: jwtAuthToken
      })
    ).id;
    newSystemPolicyId = await createNewSystemPolicy();
  });

  afterAll(async () => {
    const db = getDb();
    const res = await testServer.inject({
      method: "DELETE",
      url: `/api/v1/secret-approvals/${legacyPolicyId}`,
      headers: authHeaders()
    });
    if (res.statusCode !== 200 && res.statusCode !== 404) {
      throw new Error(`cleanup: unexpected ${res.statusCode} deleting policy ${legacyPolicyId} - ${res.payload}`);
    }
    await Promise.all(secretKeys.map((key) => deleteSecret(key)));
    await db(TableName.ApprovalRequests).whereIn("id", newSystemRequestIds).del();
    await db(TableName.ApprovalPolicies).where({ id: newSystemPolicyId }).del();
    await deleteFolder({
      workspaceId: projectId,
      environmentSlug: envSlug,
      secretPath: "/",
      id: newSystemFolderId,
      authToken: jwtAuthToken,
      forceDelete: true
    });
  });

  test("a request created on a legacy policy is reviewed and merged by the legacy service", async () => {
    const createRes = await createSecret("SAR_BRIDGE_MERGE", "value");
    expect(createRes.statusCode).toBe(200);
    const { approval } = createRes.json();
    expect(approval).toBeDefined();
    expect(approval.policyId).toBe(legacyPolicyId);

    const detailsRes = await getRequest(approval.id);
    expect(detailsRes.statusCode).toBe(200);
    expect(detailsRes.json().approval.id).toBe(approval.id);
    expect(detailsRes.json().approval.policy.id).toBe(legacyPolicyId);

    const reviewRes = await reviewRequest(approval.id, ApprovalStatus.APPROVED);
    expect(reviewRes.statusCode).toBe(200);
    expect(reviewRes.json().review.status).toBe(ApprovalStatus.APPROVED);

    const mergeRes = await mergeRequest(approval.id);
    expect(mergeRes.statusCode).toBe(200);
    expect(mergeRes.json().approval.hasMerged).toBe(true);
  });

  test("a request created on a legacy policy is closed and reopened by the legacy service", async () => {
    const createRes = await createSecret("SAR_BRIDGE_STATUS", "value");
    expect(createRes.statusCode).toBe(200);
    const { approval } = createRes.json();
    expect(approval.policyId).toBe(legacyPolicyId);

    const closeRes = await setRequestStatus(approval.id, RequestState.Closed);
    expect(closeRes.statusCode).toBe(200);
    expect(closeRes.json().approval.status).toBe(RequestState.Closed);

    const reopenRes = await setRequestStatus(approval.id, RequestState.Open);
    expect(reopenRes.statusCode).toBe(200);
    expect(reopenRes.json().approval.status).toBe(RequestState.Open);
  });

  test("a secret written under a policy on the approval system opens a secret change request there", async () => {
    const createRes = await createSecret("SAR_BRIDGE_NEW", "value", NEW_SYSTEM_PATH);
    expect(createRes.statusCode).toBe(200);
    const { approval } = createRes.json();
    newSystemRequestIds.push(approval.id);

    expect(approval).toMatchObject({
      policyId: newSystemPolicyId,
      status: RequestState.Open,
      hasMerged: false,
      folderId: newSystemFolderId,
      committerUserId: seedData1.id,
      slug: expect.any(String)
    });

    const db = getDb();
    expect(await db(TableName.ApprovalRequests).where({ id: approval.id }).first()).toMatchObject({
      type: ApprovalPolicyType.SecretChange,
      status: ApprovalRequestStatus.Open,
      policyId: newSystemPolicyId,
      requesterId: seedData1.id,
      requesterEmail: seedData1.email,
      currentStep: 1
    });
    expect(await db(TableName.SecretApprovalRequest).where({ id: approval.id }).first()).toBeUndefined();

    const change = await db(TableName.SecretChangeRequests).where({ approvalRequestId: approval.id }).first();
    expect(change).toMatchObject({ slug: approval.slug, folderId: newSystemFolderId, hasMerged: false });

    const steps = await db(TableName.ApprovalRequestSteps).where({ requestId: approval.id });
    expect(steps).toHaveLength(1);
    expect(await db(TableName.ApprovalRequestStepEligibleApprovers).where({ stepId: steps[0].id })).toMatchObject([
      { userId: seedData1.id, groupId: null }
    ]);

    const commits = await db(TableName.SecretApprovalRequestSecretV2).where({ secretChangeId: change?.id });
    expect(commits).toMatchObject([{ key: "SAR_BRIDGE_NEW", op: "create", requestId: null }]);

    const responses = await Promise.all([
      getRequest(approval.id),
      reviewRequest(approval.id, ApprovalStatus.APPROVED),
      setRequestStatus(approval.id, RequestState.Closed),
      mergeRequest(approval.id)
    ]);
    responses.forEach((res) => {
      expect(res.statusCode).toBe(400);
      expect(res.json().message).toBe(BRIDGE_MESSAGE);
    });
  });
});
