import { Knex } from "knex";

import { TableName } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { ApproverType } from "@app/ee/services/access-approval-policy/access-approval-policy-types";
import { ApprovalPolicyType } from "@app/services/approval-policy/approval-policy-enums";

const getDb = () => (globalThis as unknown as { testDb: Knex }).testDb;

const projectId = seedData1.projectV3.id;
const envSlug = seedData1.environment.slug;
const LEGACY_PATH = "/sap-policy-bridge-legacy";
const NEW_PATH = "/sap-policy-bridge-new";
const MOVED_PATH = "/sap-policy-bridge-moved";
const GLOB_BASE = "/sap-policy-bridge-glob";
const authHeaders = () => ({ authorization: `Bearer ${jwtAuthToken}` });
const approvers = [{ type: ApproverType.User, id: seedData1.id }];

const createLegacyPolicy = (secretPath: string) =>
  testServer.inject({
    method: "POST",
    url: "/api/v1/secret-approvals",
    headers: authHeaders(),
    body: { workspaceId: projectId, environment: envSlug, secretPath, approvers, approvals: 1, name: "legacy-policy" }
  });

const createBridgePolicy = (secretPath: string) =>
  testServer.inject({
    method: "POST",
    url: "/api/v2/secret-approvals",
    headers: authHeaders(),
    body: { projectId, environment: envSlug, secretPath, approvers, approvals: 1, name: "bridge-policy" }
  });

const updatePolicy = (id: string, body: Record<string, unknown>) =>
  testServer.inject({
    method: "PATCH",
    url: `/api/v2/secret-approvals/${id}`,
    headers: authHeaders(),
    body: { approvers, approvals: 1, ...body }
  });

const deletePolicy = (id: string) =>
  testServer.inject({ method: "DELETE", url: `/api/v2/secret-approvals/${id}`, headers: authHeaders() });

const listPolicies = () =>
  testServer.inject({ method: "GET", url: `/api/v2/secret-approvals?projectId=${projectId}`, headers: authHeaders() });

const getPolicy = (id: string) =>
  testServer.inject({ method: "GET", url: `/api/v2/secret-approvals/${id}`, headers: authHeaders() });

const getBoardPolicy = (secretPath: string) =>
  testServer.inject({
    method: "GET",
    url: `/api/v2/secret-approvals/board?projectId=${projectId}&environment=${envSlug}&secretPath=${encodeURIComponent(secretPath)}`,
    headers: authHeaders()
  });

const legacyRow = (id: string) => getDb()(TableName.SecretApprovalPolicy).where({ id }).first();
const bridgeRow = (id: string) => getDb()(TableName.ApprovalPolicies).where({ id }).first();
const bridgeEnvRows = (policyId: string) => getDb()(TableName.ApprovalPolicySecretEnvironment).where({ policyId });
const bridgeStep = (policyId: string) => getDb()(TableName.ApprovalPolicySteps).where({ policyId }).first();

const seedPendingRequest = async (policyId: string) => {
  const [request] = await getDb()(TableName.ApprovalRequests)
    .insert({
      projectId,
      organizationId: seedData1.organization.id,
      policyId,
      requesterId: seedData1.id,
      requesterName: "test",
      requesterEmail: seedData1.email,
      type: ApprovalPolicyType.SecretChange,
      status: "pending",
      currentStep: 0,
      requestData: JSON.stringify({})
    })
    .returning("*");
  return request.id;
};

describe("Secret approval policy bridge routing", () => {
  const legacyIds: string[] = [];
  const bridgeIds: string[] = [];
  const requestIds: string[] = [];
  const createdEnvIds: string[] = [];
  let envId: string;

  beforeAll(async () => {
    const env = await getDb()(TableName.Environment).where({ projectId, slug: envSlug }).first();
    if (!env) throw new Error("seeded environment not found");
    envId = env.id;
  });

  afterAll(async () => {
    const db = getDb();
    await db(TableName.ApprovalRequests).whereIn("id", requestIds).del();
    await db(TableName.SecretApprovalPolicy).whereIn("id", legacyIds).del();
    await db(TableName.ApprovalPolicies).whereIn("id", bridgeIds).del();
    await db(TableName.Environment).whereIn("id", createdEnvIds).del();
  });

  test("a legacy policy stays on the legacy tables through update and is soft-deleted on delete", async () => {
    const createRes = await createLegacyPolicy(LEGACY_PATH);
    expect(createRes.statusCode).toBe(200);
    const legacyId = createRes.json().approval.id as string;
    legacyIds.push(legacyId);
    expect(await legacyRow(legacyId)).toMatchObject({ secretPath: LEGACY_PATH, deletedAt: null });
    expect(await bridgeRow(legacyId)).toBeUndefined();

    const updateRes = await updatePolicy(legacyId, { name: "legacy-renamed" });
    expect(updateRes.statusCode).toBe(200);
    expect(updateRes.json().approval).toMatchObject({ id: legacyId, name: "legacy-renamed" });
    expect(await legacyRow(legacyId)).toMatchObject({ name: "legacy-renamed", deletedAt: null });
    expect(await bridgeRow(legacyId)).toBeUndefined();

    const deleteRes = await deletePolicy(legacyId);
    expect(deleteRes.statusCode).toBe(200);
    expect(deleteRes.json().approval.id).toBe(legacyId);
    const deleted = await legacyRow(legacyId);
    expect(deleted?.deletedAt).toBeInstanceOf(Date);

    const listRes = await listPolicies();
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().approvals.map((policy: { id: string }) => policy.id)).not.toContain(legacyId);
  });

  test("a policy created after the legacy one is deleted lands on the global approval system tables", async () => {
    const createRes = await createBridgePolicy(LEGACY_PATH);
    expect(createRes.statusCode).toBe(200);
    const bridgeId = createRes.json().approval.id as string;
    bridgeIds.push(bridgeId);

    expect(await bridgeRow(bridgeId)).toMatchObject({ type: ApprovalPolicyType.SecretChange, projectId });
    expect(await bridgeEnvRows(bridgeId)).toMatchObject([{ policyId: bridgeId, envId, secretPath: LEGACY_PATH }]);
    expect(await legacyRow(bridgeId)).toBeUndefined();
    expect(createRes.json().approval).toMatchObject({
      id: bridgeId,
      secretPath: LEGACY_PATH,
      approvals: 1,
      envId,
      environment: { id: envId, slug: envSlug },
      environments: [{ id: envId, slug: envSlug }]
    });
  });

  test("a policy on the global approval system is read back through the legacy routes", async () => {
    const [bridgeId] = bridgeIds;

    const listRes = await listPolicies();
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().approvals).toContainEqual(
      expect.objectContaining({
        id: bridgeId,
        secretPath: LEGACY_PATH,
        approvers: [{ id: seedData1.id, type: ApproverType.User }],
        bypassers: []
      })
    );

    const getRes = await getPolicy(bridgeId);
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().approval).toMatchObject({
      id: bridgeId,
      secretPath: LEGACY_PATH,
      approvals: 1,
      deletedAt: null,
      environment: { id: envId, slug: envSlug },
      environments: [{ id: envId, slug: envSlug }],
      approvers: [{ id: seedData1.id, type: ApproverType.User, username: seedData1.email }],
      bypassers: []
    });

    const boardRes = await getBoardPolicy(LEGACY_PATH);
    expect(boardRes.statusCode).toBe(200);
    expect(boardRes.json().policy).toMatchObject({
      id: bridgeId,
      secretPath: LEGACY_PATH,
      userApprovers: [{ userId: seedData1.id }]
    });

    const missRes = await getPolicy("00000000-0000-0000-0000-000000000000");
    expect(missRes.statusCode).toBe(404);
  });

  test("an update is refused when the path is governed by a policy on the other store", async () => {
    const legacyRes = await createLegacyPolicy(NEW_PATH);
    expect(legacyRes.statusCode).toBe(200);
    const legacyId = legacyRes.json().approval.id as string;
    legacyIds.push(legacyId);
    const [bridgeId] = bridgeIds;

    const legacyOntoBridge = await updatePolicy(legacyId, { secretPath: LEGACY_PATH });
    expect(legacyOntoBridge.statusCode).toBe(400);
    expect(legacyOntoBridge.json().message).toBe(
      `A policy for secret path '${LEGACY_PATH}' already exists in environment '${envSlug}'`
    );

    const bridgeOntoLegacy = await updatePolicy(bridgeId, { secretPath: NEW_PATH });
    expect(bridgeOntoLegacy.statusCode).toBe(400);
    expect(bridgeOntoLegacy.json().message).toBe(
      `A policy for secret path '${NEW_PATH}' already exists in environment '${envSlug}'`
    );

    const bridgeOntoItself = await updatePolicy(bridgeId, { name: "bridge-renamed" });
    expect([bridgeOntoItself.statusCode, bridgeOntoItself.payload]).toEqual([200, expect.any(String)]);
    expect(await bridgeRow(bridgeId)).toMatchObject({ name: "bridge-renamed" });
  });

  test("a policy on the global approval system is updated in place and hard-deleted", async () => {
    const [bridgeId] = bridgeIds;

    const updateRes = await updatePolicy(bridgeId, {
      name: "bridge-moved",
      approvals: 1,
      secretPath: MOVED_PATH,
      allowedSelfApprovals: false
    });
    expect(updateRes.statusCode).toBe(200);
    expect(updateRes.json().approval).toMatchObject({
      id: bridgeId,
      name: "bridge-moved",
      secretPath: MOVED_PATH,
      approvals: 1,
      allowedSelfApprovals: false,
      environment: { slug: envSlug }
    });
    expect(await bridgeRow(bridgeId)).toMatchObject({
      name: "bridge-moved",
      constraints: { version: 1, constraints: { allowedSelfApprovals: false } }
    });
    expect(await bridgeStep(bridgeId)).toMatchObject({ stepNumber: 1, requiredApprovals: 1 });
    expect(await bridgeEnvRows(bridgeId)).toMatchObject([{ envId, secretPath: MOVED_PATH }]);
    expect(await legacyRow(bridgeId)).toBeUndefined();

    const requestId = await seedPendingRequest(bridgeId);
    requestIds.push(requestId);

    const deleteRes = await deletePolicy(bridgeId);
    expect(deleteRes.statusCode).toBe(200);
    expect(deleteRes.json().approval).toMatchObject({ id: bridgeId, secretPath: MOVED_PATH });
    expect(deleteRes.json().approval.deletedAt).not.toBeNull();
    expect(await bridgeRow(bridgeId)).toBeUndefined();
    expect(await bridgeEnvRows(bridgeId)).toHaveLength(0);
    expect(await bridgeStep(bridgeId)).toBeUndefined();

    // Pins the current gap: the bridge does not cancel pending requests the way legacy closes open ones.
    // Flip this to expect "cancelled" when secret change requests move onto the global approval system.
    expect(await getDb()(TableName.ApprovalRequests).where({ id: requestId }).first()).toMatchObject({
      status: "pending",
      policyId: null
    });

    const recreateRes = await createBridgePolicy(MOVED_PATH);
    expect(recreateRes.statusCode).toBe(200);
    bridgeIds.push(recreateRes.json().approval.id);
  });

  test("a secret path is resolved across both stores with the exact path winning over a glob", async () => {
    const legacyRes = await createLegacyPolicy(`${GLOB_BASE}/**`);
    expect(legacyRes.statusCode).toBe(200);
    const legacyId = legacyRes.json().approval.id as string;
    legacyIds.push(legacyId);

    const bridgeRes = await createBridgePolicy(`${GLOB_BASE}/svc`);
    expect(bridgeRes.statusCode).toBe(200);
    const bridgeId = bridgeRes.json().approval.id as string;
    bridgeIds.push(bridgeId);

    const exactRes = await getBoardPolicy(`${GLOB_BASE}/svc`);
    expect(exactRes.statusCode).toBe(200);
    expect(exactRes.json().policy).toMatchObject({ id: bridgeId, secretPath: `${GLOB_BASE}/svc` });

    const globRes = await getBoardPolicy(`${GLOB_BASE}/other`);
    expect(globRes.statusCode).toBe(200);
    expect(globRes.json().policy).toMatchObject({ id: legacyId, secretPath: `${GLOB_BASE}/**` });

    const listRes = await listPolicies();
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().approvals.map((policy: { id: string }) => policy.id)).toEqual(
      expect.arrayContaining([legacyId, bridgeId])
    );
  });

  test("an environment used by a policy on the global approval system cannot be deleted", async () => {
    const guardedSlug = "sap-bridge-env-delete";
    const envRes = await testServer.inject({
      method: "POST",
      url: `/api/v1/workspace/${projectId}/environments`,
      headers: authHeaders(),
      body: { name: "SAP bridge env delete", slug: guardedSlug }
    });
    expect(envRes.statusCode).toBe(200);
    const guardedEnvId = envRes.json().environment.id as string;
    createdEnvIds.push(guardedEnvId);

    const policyRes = await testServer.inject({
      method: "POST",
      url: "/api/v2/secret-approvals",
      headers: authHeaders(),
      body: { projectId, environment: guardedSlug, secretPath: "/", approvers, approvals: 1, name: "env-delete-guard" }
    });
    expect(policyRes.statusCode).toBe(200);
    const bridgeId = policyRes.json().approval.id as string;
    bridgeIds.push(bridgeId);
    expect(await bridgeRow(bridgeId)).toMatchObject({ type: ApprovalPolicyType.SecretChange });

    const deleteEnv = (hardDelete: boolean) =>
      testServer.inject({
        method: "DELETE",
        url: `/api/v1/workspace/${projectId}/environments/${guardedEnvId}?hardDelete=${hardDelete}`,
        headers: authHeaders()
      });

    const softDeleteRes = await deleteEnv(false);
    expect(softDeleteRes.statusCode).toBe(400);
    expect(softDeleteRes.json().message).toBe("Environment is in use by a secret approval policy");

    const hardDeleteRes = await deleteEnv(true);
    expect(hardDeleteRes.statusCode).toBe(400);
    expect(hardDeleteRes.json().message).toBe("Environment is in use by a secret approval policy");

    expect(await getDb()(TableName.Environment).where({ id: guardedEnvId }).first()).toMatchObject({
      deleteAfter: null
    });
    expect(await bridgeEnvRows(bridgeId)).toMatchObject([{ envId: guardedEnvId }]);

    const deletePolicyRes = await deletePolicy(bridgeId);
    expect(deletePolicyRes.statusCode).toBe(200);

    const deleteEnvRes = await deleteEnv(true);
    expect(deleteEnvRes.statusCode).toBe(200);
    expect(deleteEnvRes.json().environment.id).toBe(guardedEnvId);
  });
});
