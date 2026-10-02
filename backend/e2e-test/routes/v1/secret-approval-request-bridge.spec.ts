import { Knex } from "knex";

import { SecretType, TableName } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { ApprovalStatus, RequestState } from "@app/ee/services/secret-approval-request/secret-approval-request-types";

const getDb = () => (globalThis as unknown as { testDb: Knex }).testDb;

const BRIDGE_MESSAGE = "Secret change requests on the approval system are not available yet.";
const projectId = seedData1.projectV3.id;
const authHeaders = () => ({ authorization: `Bearer ${jwtAuthToken}` });

const createSecret = (key: string, value: string) =>
  testServer.inject({
    method: "POST",
    url: `/api/v4/secrets/${key}`,
    headers: authHeaders(),
    body: {
      projectId,
      environment: seedData1.environment.slug,
      secretPath: "/",
      type: SecretType.Shared,
      secretKey: key,
      secretValue: value
    }
  });

const deleteSecret = (key: string) =>
  testServer.inject({
    method: "DELETE",
    url: `/api/v4/secrets/${key}`,
    headers: authHeaders(),
    body: { projectId, environment: seedData1.environment.slug, secretPath: "/" }
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

const seedNewSystemRequest = async (db: Knex) => {
  const [policy] = await db(TableName.ApprovalPolicies)
    .insert({
      projectId,
      organizationId: seedData1.organization.id,
      type: "secret-change",
      name: "new-system-bridge-test-policy",
      conditions: JSON.stringify({}),
      constraints: JSON.stringify({})
    })
    .returning("*");
  const [request] = await db(TableName.ApprovalRequests)
    .insert({
      projectId,
      organizationId: seedData1.organization.id,
      policyId: policy.id,
      requesterId: seedData1.id,
      requesterName: "test",
      requesterEmail: seedData1.email,
      type: "secret-change",
      status: "pending",
      currentStep: 0,
      requestData: JSON.stringify({})
    })
    .returning("*");
  return { policyId: policy.id, requestId: request.id };
};

describe("Secret approval request bridge routing", () => {
  let legacyPolicyId: string;
  let newSystemPolicyId: string;
  let newSystemRequestId: string;
  const secretKeys = ["SAR_BRIDGE_MERGE", "SAR_BRIDGE_STATUS"];

  beforeAll(async () => {
    const db = getDb();
    legacyPolicyId = (await seedLegacyPolicy(db)).id;
    ({ policyId: newSystemPolicyId, requestId: newSystemRequestId } = await seedNewSystemRequest(db));
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
    await Promise.all(secretKeys.map(deleteSecret));
    await db(TableName.ApprovalRequests).where({ id: newSystemRequestId }).del();
    await db(TableName.ApprovalPolicies).where({ id: newSystemPolicyId }).del();
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

  test("a request that lives in the approval system tables is routed to the bridge", async () => {
    const responses = await Promise.all([
      getRequest(newSystemRequestId),
      reviewRequest(newSystemRequestId, ApprovalStatus.APPROVED),
      setRequestStatus(newSystemRequestId, RequestState.Closed),
      mergeRequest(newSystemRequestId)
    ]);

    responses.forEach((res) => {
      expect(res.statusCode).toBe(400);
      expect(res.json().message).toBe(BRIDGE_MESSAGE);
    });
  });
});
