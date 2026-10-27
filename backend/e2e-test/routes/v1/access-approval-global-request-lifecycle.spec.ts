import { Knex } from "knex";

import { TableName } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { ApproverType } from "@app/ee/services/access-approval-policy/access-approval-policy-types";

const getDb = () => (globalThis as unknown as { testDb: Knex }).testDb;

const SECRET_ACCESS_TYPE = "secret-access";

const globalPolicyIds: string[] = [];

const authHeaders = () => ({ authorization: `Bearer ${jwtAuthToken}` });

const createGlobalPolicy = async (dto: { name: string; secretPath: string }, body: Record<string, unknown> = {}) => {
  const res = await testServer.inject({
    method: "POST",
    url: "/api/v1/access-approvals/policies",
    headers: authHeaders(),
    body: {
      projectSlug: seedData1.project.slug,
      environment: seedData1.environment.slug,
      name: dto.name,
      secretPath: dto.secretPath,
      approvers: [{ type: ApproverType.User, id: seedData1.id }],
      approvals: 1,
      allowedSelfApprovals: true,
      ...body
    }
  });
  expect(res.statusCode).toBe(200);
  const { approval } = res.json();
  globalPolicyIds.push(approval.id);
  return approval as { id: string };
};

const createAccessRequest = (secretPath: string, body: Record<string, unknown> = {}) =>
  testServer.inject({
    method: "POST",
    url: `/api/v1/access-approvals/requests?projectSlug=${seedData1.project.slug}`,
    headers: authHeaders(),
    body: {
      permissions: [
        ["read", "secrets", { environment: seedData1.environment.slug, secretPath: { $glob: secretPath } }]
      ],
      isTemporary: false,
      ...body
    }
  });

const reviewAccessRequest = (requestId: string, body: Record<string, unknown>) =>
  testServer.inject({
    method: "POST",
    url: `/api/v1/access-approvals/requests/${requestId}/review`,
    headers: authHeaders(),
    body
  });

describe("Access approval request lifecycle on the global system", () => {
  afterEach(async () => {
    const db = getDb();
    const globalIds = globalPolicyIds.splice(0);

    await db(TableName.ApprovalRequestGrants)
      .where({ projectId: seedData1.project.id, type: SECRET_ACCESS_TYPE })
      .del();
    if (globalIds.length) {
      await db(TableName.ApprovalRequests).whereIn("policyId", globalIds).del();
      await db(TableName.ApprovalPolicies).whereIn("id", globalIds).del();
    }
  });

  test("An expired request cannot be approved or rejected and is marked expired", async () => {
    const db = getDb();
    const secretPath = "/lifecycle-expired";
    await createGlobalPolicy({ name: "lifecycle-expired", secretPath }, { requestExpirationTime: "1h" });

    const createRes = await createAccessRequest(secretPath);
    expect(createRes.statusCode).toBe(200);
    const requestId = createRes.json().approval.id as string;
    const created = await db(TableName.ApprovalRequests).where({ id: requestId }).first();
    expect(created?.expiresAt).toBeTruthy();

    await db(TableName.ApprovalRequests)
      .where({ id: requestId })
      .update({ expiresAt: new Date(Date.now() - 60_000) });

    const approveRes = await reviewAccessRequest(requestId, { status: "approved" });
    expect(approveRes.statusCode).toBe(400);
    expect(approveRes.json().message).toBe("This access request has expired and can no longer be reviewed");

    const request = await db(TableName.ApprovalRequests).where({ id: requestId }).first();
    expect(request?.status).toBe("expired");
    const grants = await db(TableName.ApprovalRequestGrants).where({ requestId });
    expect(grants).toHaveLength(0);

    const rejectRes = await reviewAccessRequest(requestId, { status: "rejected" });
    expect(rejectRes.statusCode).toBe(400);
    expect(rejectRes.json().message).toBe("The request has been closed");
  });
});
