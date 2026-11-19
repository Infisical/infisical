import { createFolder, deleteFolder } from "e2e-test/testUtils/folders";
import {
  createSecretChangePolicy,
  deleteSecretChangePolicy,
  seedLegacySecretApprovalPolicy
} from "e2e-test/testUtils/secret-approval-policies";
import { Knex } from "knex";

import { SecretType, TableName } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { ApproverType } from "@app/ee/services/access-approval-policy/access-approval-policy-types";
import { ApprovalStatus, RequestState } from "@app/ee/services/secret-change-request/secret-change-request-types";
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

const createGlobalSystemPolicy = async () =>
  (
    await createSecretChangePolicy({
      body: {
        projectId,
        environment: envSlug,
        secretPath: GLOBAL_SYSTEM_PATH,
        approvers: [{ type: ApproverType.User, id: seedData1.id }],
        approvals: 1,
        name: "global-system-bridge-test-policy"
      },
      authToken: jwtAuthToken
    })
  ).id;

describe("Secret approval request routing", () => {
  let legacyPolicyId: string;
  let globalSystemPolicyId: string;
  let globalSystemFolderId: string;
  const globalSystemRequestIds: string[] = [];
  const legacyRequestIds: string[] = [];
  const secretKeys = ["SAR_BRIDGE_DIRECT"];

  beforeAll(async () => {
    const db = getDb();
    legacyPolicyId = (
      await seedLegacySecretApprovalPolicy(db, {
        projectId,
        environment: envSlug,
        secretPath: "/",
        name: "legacy-bridge-test-policy",
        approverUserId: seedData1.id
      })
    ).id;
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
    await Promise.all(secretKeys.map((key) => deleteSecret(key)));
    await db(TableName.SecretApprovalRequest).whereIn("id", legacyRequestIds).del();
    await db(TableName.SecretApprovalPolicy).where({ id: legacyPolicyId }).del();
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

  test("a policy that only exists in the legacy tables does not gate a write", async () => {
    const createRes = await createSecret("SAR_BRIDGE_DIRECT", "value");
    expect(createRes.statusCode).toBe(200);
    expect(createRes.json().approval).toBeUndefined();
    expect(createRes.json().secret).toMatchObject({ secretKey: "SAR_BRIDGE_DIRECT" });
    expect(await getDb()(TableName.SecretApprovalRequest).where({ policyId: legacyPolicyId })).toEqual([]);
  });

  test("a request that only exists in the legacy tables is not listed, counted or served", async () => {
    const before = await countRequests();
    expect(before.statusCode).toBe(200);

    const [legacyRequest] = await getDb()(TableName.SecretApprovalRequest)
      .insert({
        policyId: legacyPolicyId,
        folderId: globalSystemFolderId,
        slug: "sar-bridge-legacy-only",
        status: RequestState.Open,
        committerUserId: seedData1.id
      })
      .returning("*");
    legacyRequestIds.push(legacyRequest.id);

    const listRes = await listRequests();
    expect(listRes.statusCode).toBe(200);
    const listed: { approvals: TListedRequest[] } = listRes.json();
    expect(listed.approvals.map((row) => row.id)).not.toContain(legacyRequest.id);

    const after = await countRequests();
    expect(after.statusCode).toBe(200);
    expect(after.json().approvals).toEqual(before.json().approvals);

    expect((await getRequest(legacyRequest.id)).statusCode).toBe(404);
    expect((await reviewRequest(legacyRequest.id, ApprovalStatus.APPROVED)).statusCode).toBe(404);
    expect((await setRequestStatus(legacyRequest.id, RequestState.Closed)).statusCode).toBe(404);
    expect((await mergeRequest(legacyRequest.id)).statusCode).toBe(404);
    expect(await getDb()(TableName.SecretApprovalRequest).where({ id: legacyRequest.id }).first()).toMatchObject({
      status: RequestState.Open,
      hasMerged: false
    });
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

  test("the list and the count return requests on the global approval system", async () => {
    const globalRes = await createSecret("SAR_BRIDGE_LIST_GLOBAL", "value", GLOBAL_SYSTEM_PATH);
    expect(globalRes.statusCode).toBe(200);
    const globalRequest: TListedRequest = globalRes.json().approval;
    globalSystemRequestIds.push(globalRequest.id);

    const listRes = await listRequests();
    expect(listRes.statusCode).toBe(200);
    const listed: { approvals: TListedRequest[]; totalCount: number } = listRes.json();
    expect(listed.totalCount).toBeGreaterThanOrEqual(1);
    expect(listed.approvals.find((row) => row.id === globalRequest.id)).toMatchObject({
      policy: { id: globalSystemPolicyId, secretPath: GLOBAL_SYSTEM_PATH, deletedAt: null },
      environment: envSlug,
      secretPath: GLOBAL_SYSTEM_PATH,
      status: RequestState.Open,
      committerUser: { userId: seedData1.id },
      approvers: [{ userId: seedData1.id }],
      reviewers: [],
      commits: [{ op: "create" }]
    });

    const openRes = await listRequests(`&status=${RequestState.Open}`);
    expect(openRes.statusCode).toBe(200);
    const open: { approvals: TListedRequest[] } = openRes.json();
    expect(open.approvals.map((row) => row.id)).toContain(globalRequest.id);
    expect(open.approvals.every((row) => row.status === RequestState.Open)).toBe(true);

    const countRes = await countRequests();
    expect(countRes.statusCode).toBe(200);
    expect(countRes.json().approvals.open).toBeGreaterThanOrEqual(1);
  });

  test("a migrated request's legacy twin is not listed, counted or read", async () => {
    const globalRes = await createSecret("SAR_BRIDGE_MIGRATED", "value", GLOBAL_SYSTEM_PATH);
    expect(globalRes.statusCode).toBe(200);
    const requestId = (globalRes.json().approval as TListedRequest).id;
    globalSystemRequestIds.push(requestId);

    const before = await countRequests();
    expect(before.statusCode).toBe(200);

    const legacyTwin = {
      id: requestId,
      policyId: legacyPolicyId,
      folderId: globalSystemFolderId,
      slug: "sar-bridge-migrated-twin",
      status: RequestState.Open,
      committerUserId: seedData1.id
    };
    await getDb()(TableName.SecretApprovalRequest).insert(legacyTwin);
    legacyRequestIds.push(requestId);

    const listRes = await listRequests();
    expect(listRes.statusCode).toBe(200);
    const listed: { approvals: (TListedRequest & { policy: { id: string } })[] } = listRes.json();
    const matches = listed.approvals.filter((row) => row.id === requestId);
    expect(matches).toHaveLength(1);
    expect(matches[0].policy.id).toBe(globalSystemPolicyId);

    const after = await countRequests();
    expect(after.statusCode).toBe(200);
    expect(after.json().approvals).toEqual(before.json().approvals);

    const getRes = await getRequest(requestId);
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().approval).toMatchObject({ id: requestId, policy: { id: globalSystemPolicyId } });
  });

  test("a request on the global approval system is closed and reopened in place", async () => {
    const db = getDb();

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

    const closeAgainRes = await setRequestStatus(globalRequest.id, RequestState.Closed);
    expect(closeAgainRes.statusCode).toBe(400);
    expect(closeAgainRes.json().message).toBe("Approval request is already closed");

    const reopenGlobalRes = await setRequestStatus(globalRequest.id, RequestState.Open);
    expect(reopenGlobalRes.statusCode).toBe(200);
    expect(reopenGlobalRes.json().approval.status).toBe(RequestState.Open);
    expect(await db(TableName.ApprovalRequests).where({ id: globalRequest.id }).first()).toMatchObject({
      status: ApprovalRequestStatus.Open
    });
  });

  test("deleting a policy on the global approval system closes its open requests and keeps them readable", async () => {
    const db = getDb();

    const createRes = await createSecret("SAR_BRIDGE_POLICY_DELETE", "value", GLOBAL_SYSTEM_PATH);
    expect(createRes.statusCode).toBe(200);
    const request: TListedRequest = createRes.json().approval;
    globalSystemRequestIds.push(request.id);

    await deleteSecretChangePolicy({ policyId: globalSystemPolicyId, authToken: jwtAuthToken });

    expect(await db(TableName.ApprovalPolicies).where({ id: globalSystemPolicyId }).first()).toBeUndefined();
    expect(
      await db(TableName.ApprovalRequests)
        .whereIn("id", globalSystemRequestIds)
        .where({ status: ApprovalRequestStatus.Open })
    ).toEqual([]);
    expect(await db(TableName.ApprovalRequests).where({ id: request.id }).first()).toMatchObject({
      status: ApprovalRequestStatus.Closed,
      policyId: null
    });

    const closedRes = await listRequests(`&status=${RequestState.Closed}`);
    expect(closedRes.statusCode).toBe(200);
    const closed: { approvals: (TListedRequest & { policyId: string | null })[] } = closedRes.json();
    expect(closed.approvals.find((row) => row.id === request.id)).toMatchObject({
      policyId: null,
      status: RequestState.Closed,
      policy: { name: "Deleted policy", deletedAt: expect.any(String) as string }
    });

    const detailsRes = await getRequest(request.id);
    expect(detailsRes.statusCode).toBe(200);
    expect(detailsRes.json().approval).toMatchObject({
      policyId: null,
      status: RequestState.Closed,
      policy: { name: "Deleted policy" }
    });
  });
});
