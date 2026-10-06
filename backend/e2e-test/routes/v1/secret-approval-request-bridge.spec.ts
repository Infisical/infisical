import { createFolder, deleteFolder } from "e2e-test/testUtils/folders";
import { Knex } from "knex";

import { SecretType, TableName } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { ApproverType } from "@app/ee/services/access-approval-policy/access-approval-policy-types";
import { ApprovalStatus, RequestState } from "@app/ee/services/secret-approval-request/secret-approval-request-types";
import { ApprovalPolicyType, ApprovalRequestStatus } from "@app/services/approval-policy/approval-policy-enums";

const getDb = () => (globalThis as unknown as { testDb: Knex }).testDb;

const projectId = seedData1.projectV3.id;
const envSlug = seedData1.environment.slug;
const GLOBAL_SYSTEM_FOLDER = "sar-bridge-global";
const GLOBAL_SYSTEM_PATH = `/${GLOBAL_SYSTEM_FOLDER}`;
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

const listRequests = (query = "") =>
  testServer.inject({
    method: "GET",
    url: `/api/v1/secret-approval-requests?projectId=${projectId}&limit=50${query}`,
    headers: authHeaders()
  });

const countRequests = () =>
  testServer.inject({
    method: "GET",
    url: `/api/v1/secret-approval-requests/count?projectId=${projectId}`,
    headers: authHeaders()
  });

type TListedRequest = { id: string; status: string };

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

const createGlobalSystemPolicy = async () => {
  const res = await testServer.inject({
    method: "POST",
    url: "/api/v2/secret-approvals",
    headers: authHeaders(),
    body: {
      projectId,
      environment: envSlug,
      secretPath: GLOBAL_SYSTEM_PATH,
      approvers: [{ type: ApproverType.User, id: seedData1.id }],
      approvals: 1,
      name: "global-system-bridge-test-policy"
    }
  });
  expect(res.statusCode).toBe(200);
  return res.json().approval.id as string;
};

describe("Secret approval request bridge routing", () => {
  let legacyPolicyId: string;
  let globalSystemPolicyId: string;
  let globalSystemFolderId: string;
  const globalSystemRequestIds: string[] = [];
  const secretKeys = ["SAR_BRIDGE_MERGE", "SAR_BRIDGE_STATUS", "SAR_BRIDGE_LIST_LEGACY", "SAR_BRIDGE_STATUS_LEGACY"];

  beforeAll(async () => {
    const db = getDb();
    legacyPolicyId = (await seedLegacyPolicy(db)).id;
    globalSystemFolderId = (
      await createFolder({
        workspaceId: projectId,
        environmentSlug: envSlug,
        secretPath: "/",
        name: GLOBAL_SYSTEM_FOLDER,
        authToken: jwtAuthToken
      })
    ).id;
    globalSystemPolicyId = await createGlobalSystemPolicy();
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
    await db(TableName.ApprovalRequests).whereIn("id", globalSystemRequestIds).del();
    await db(TableName.ApprovalPolicies).where({ id: globalSystemPolicyId }).del();
    await deleteFolder({
      workspaceId: projectId,
      environmentSlug: envSlug,
      secretPath: "/",
      id: globalSystemFolderId,
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

  test("a secret written under a policy on the global approval system opens a secret change request there", async () => {
    const createRes = await createSecret("SAR_BRIDGE_GLOBAL", "value", GLOBAL_SYSTEM_PATH);
    expect(createRes.statusCode).toBe(200);
    const { approval } = createRes.json();
    globalSystemRequestIds.push(approval.id);

    expect(approval).toMatchObject({
      policyId: globalSystemPolicyId,
      status: RequestState.Open,
      hasMerged: false,
      folderId: globalSystemFolderId,
      committerUserId: seedData1.id,
      slug: expect.any(String)
    });

    const db = getDb();
    expect(await db(TableName.ApprovalRequests).where({ id: approval.id }).first()).toMatchObject({
      type: ApprovalPolicyType.SecretChange,
      status: ApprovalRequestStatus.Open,
      policyId: globalSystemPolicyId,
      requesterId: seedData1.id,
      requesterEmail: seedData1.email,
      currentStep: 1
    });
    expect(await db(TableName.SecretApprovalRequest).where({ id: approval.id }).first()).toBeUndefined();

    const change = await db(TableName.SecretChangeRequests).where({ approvalRequestId: approval.id }).first();
    expect(change).toMatchObject({ slug: approval.slug, folderId: globalSystemFolderId, hasMerged: false });

    const steps = await db(TableName.ApprovalRequestSteps).where({ requestId: approval.id });
    expect(steps).toHaveLength(1);
    expect(await db(TableName.ApprovalRequestStepEligibleApprovers).where({ stepId: steps[0].id })).toMatchObject([
      { userId: seedData1.id, groupId: null }
    ]);

    const commits = await db(TableName.SecretApprovalRequestSecretV2).where({ secretChangeId: change?.id });
    expect(commits).toMatchObject([{ key: "SAR_BRIDGE_GLOBAL", op: "create", requestId: null }]);

    const reviewRes = await reviewRequest(approval.id, ApprovalStatus.APPROVED);
    expect(reviewRes.statusCode).toBe(200);
    expect(reviewRes.json().review).toMatchObject({
      requestId: approval.id,
      reviewerUserId: seedData1.id,
      status: ApprovalStatus.APPROVED
    });
    expect(await db(TableName.ApprovalRequestApprovals).where({ stepId: steps[0].id })).toMatchObject([
      { approverUserId: seedData1.id, decision: ApprovalStatus.APPROVED }
    ]);

    const detailsRes = await getRequest(approval.id);
    expect(detailsRes.statusCode).toBe(200);
    expect(detailsRes.json().approval).toMatchObject({
      id: approval.id,
      status: RequestState.Open,
      environment: envSlug,
      secretPath: GLOBAL_SYSTEM_PATH,
      folderId: globalSystemFolderId,
      committerUser: { userId: seedData1.id, email: seedData1.email },
      policy: { id: globalSystemPolicyId, deletedAt: null, approvers: [{ userId: seedData1.id }] },
      reviewers: [{ userId: seedData1.id, status: ApprovalStatus.APPROVED }],
      commits: [{ secretKey: "SAR_BRIDGE_GLOBAL", op: "create", secretValueHidden: false, secretValue: "value" }]
    });

    const mergeRes = await mergeRequest(approval.id);
    expect(mergeRes.statusCode).toBe(200);
    expect(mergeRes.json().approval).toMatchObject({ hasMerged: true, status: RequestState.Closed });
    expect(await db(TableName.ApprovalRequests).where({ id: approval.id }).first()).toMatchObject({
      status: ApprovalRequestStatus.Closed
    });
    expect(await db(TableName.SecretChangeRequests).where({ approvalRequestId: approval.id }).first()).toMatchObject({
      hasMerged: true,
      statusChangedByUserId: seedData1.id
    });
  });

  test("the list and the count return requests from both systems for one project", async () => {
    const legacyRes = await createSecret("SAR_BRIDGE_LIST_LEGACY", "value");
    expect(legacyRes.statusCode).toBe(200);
    const legacyRequest: TListedRequest = legacyRes.json().approval;
    const globalRes = await createSecret("SAR_BRIDGE_LIST_GLOBAL", "value", GLOBAL_SYSTEM_PATH);
    expect(globalRes.statusCode).toBe(200);
    const globalRequest: TListedRequest = globalRes.json().approval;
    globalSystemRequestIds.push(globalRequest.id);

    const listRes = await listRequests();
    expect(listRes.statusCode).toBe(200);
    const listed: { approvals: TListedRequest[]; totalCount: number } = listRes.json();
    expect(listed.totalCount).toBeGreaterThanOrEqual(2);
    expect(listed.approvals.find((row) => row.id === legacyRequest.id)).toMatchObject({
      policy: { id: legacyPolicyId },
      environment: envSlug,
      status: RequestState.Open,
      committerUser: { userId: seedData1.id },
      approvers: [{ userId: seedData1.id }],
      commits: [{ op: "create" }]
    });
    expect(listed.approvals.find((row) => row.id === globalRequest.id)).toMatchObject({
      policy: { id: globalSystemPolicyId, secretPath: GLOBAL_SYSTEM_PATH, deletedAt: null },
      environment: envSlug,
      status: RequestState.Open,
      committerUser: { userId: seedData1.id },
      approvers: [{ userId: seedData1.id }],
      reviewers: [],
      commits: [{ op: "create" }]
    });

    const openRes = await listRequests(`&status=${RequestState.Open}`);
    expect(openRes.statusCode).toBe(200);
    const open: { approvals: TListedRequest[] } = openRes.json();
    expect(open.approvals.map((row) => row.id)).toEqual(
      expect.arrayContaining([legacyRequest.id, globalRequest.id]) as string[]
    );
    expect(open.approvals.every((row) => row.status === RequestState.Open)).toBe(true);

    const countRes = await countRequests();
    expect(countRes.statusCode).toBe(200);
    expect(countRes.json().approvals.open).toBeGreaterThanOrEqual(2);
  });

  test("a status change keeps a request on the system it was opened on", async () => {
    const db = getDb();

    const legacyRes = await createSecret("SAR_BRIDGE_STATUS_LEGACY", "value");
    expect(legacyRes.statusCode).toBe(200);
    const legacyRequest: TListedRequest = legacyRes.json().approval;
    const closeLegacyRes = await setRequestStatus(legacyRequest.id, RequestState.Closed);
    expect(closeLegacyRes.statusCode).toBe(200);
    expect(closeLegacyRes.json().approval.status).toBe(RequestState.Closed);
    expect(await db(TableName.SecretApprovalRequest).where({ id: legacyRequest.id }).first()).toMatchObject({
      status: RequestState.Closed,
      statusChangedByUserId: seedData1.id
    });
    expect(await db(TableName.ApprovalRequests).where({ id: legacyRequest.id }).first()).toBeUndefined();
    expect(
      await db(TableName.SecretChangeRequests).where({ approvalRequestId: legacyRequest.id }).first()
    ).toBeUndefined();
    const reopenLegacyRes = await setRequestStatus(legacyRequest.id, RequestState.Open);
    expect(reopenLegacyRes.statusCode).toBe(200);
    expect(await db(TableName.SecretApprovalRequest).where({ id: legacyRequest.id }).first()).toMatchObject({
      status: RequestState.Open
    });
    expect(await db(TableName.ApprovalRequests).where({ id: legacyRequest.id }).first()).toBeUndefined();

    const globalRes = await createSecret("SAR_BRIDGE_STATUS_GLOBAL", "value", GLOBAL_SYSTEM_PATH);
    expect(globalRes.statusCode).toBe(200);
    const globalRequest: TListedRequest = globalRes.json().approval;
    globalSystemRequestIds.push(globalRequest.id);
    const closeGlobalRes = await setRequestStatus(globalRequest.id, RequestState.Closed);
    expect(closeGlobalRes.statusCode).toBe(200);
    expect(closeGlobalRes.json().approval).toMatchObject({
      id: globalRequest.id,
      status: RequestState.Closed,
      statusChangedByUserId: seedData1.id,
      hasMerged: false
    });
    expect(await db(TableName.ApprovalRequests).where({ id: globalRequest.id }).first()).toMatchObject({
      status: ApprovalRequestStatus.Closed
    });
    expect(
      await db(TableName.SecretChangeRequests).where({ approvalRequestId: globalRequest.id }).first()
    ).toMatchObject({ statusChangedByUserId: seedData1.id, hasMerged: false });
    expect(await db(TableName.SecretApprovalRequest).where({ id: globalRequest.id }).first()).toBeUndefined();

    const closeAgainRes = await setRequestStatus(globalRequest.id, RequestState.Closed);
    expect(closeAgainRes.statusCode).toBe(400);
    expect(closeAgainRes.json().message).toBe("Approval request is already closed");

    const reopenGlobalRes = await setRequestStatus(globalRequest.id, RequestState.Open);
    expect(reopenGlobalRes.statusCode).toBe(200);
    expect(reopenGlobalRes.json().approval.status).toBe(RequestState.Open);
    expect(await db(TableName.ApprovalRequests).where({ id: globalRequest.id }).first()).toMatchObject({
      status: ApprovalRequestStatus.Open
    });
    expect(await db(TableName.SecretApprovalRequest).where({ id: globalRequest.id }).first()).toBeUndefined();
  });
});
