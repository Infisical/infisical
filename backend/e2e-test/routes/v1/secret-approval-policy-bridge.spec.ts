import { seedLegacySecretApprovalPolicy } from "e2e-test/testUtils/secret-approval-policies";
import { Knex } from "knex";

import { TableName } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { ApproverType } from "@app/ee/services/access-approval-policy/access-approval-policy-types";
import { ApprovalPolicyType } from "@app/services/approval-policy/approval-policy-enums";
import { DelegatedApprovalPolicyType } from "@app/services/delegated-approval/delegated-approval-enums";

const getDb = () => (globalThis as unknown as { testDb: Knex }).testDb;

const projectId = seedData1.projectV3.id;
const envSlug = seedData1.environment.slug;
const LEGACY_PATH = "/sap-policy-bridge-legacy";
const NEW_PATH = "/sap-policy-bridge-new";
const MOVED_PATH = "/sap-policy-bridge-moved";
const TAKEN_PATH = "/sap-policy-bridge-taken";
const GLOB_BASE = "/sap-policy-bridge-glob";
const V1_PATH = "/sap-policy-bridge-v1";
const MIGRATED_PATH = "/sap-policy-bridge-migrated";
const authHeaders = () => ({ authorization: `Bearer ${jwtAuthToken}` });
const approvers = [{ type: ApproverType.User, id: seedData1.id }];

const seedLegacyPolicy = (secretPath: string) =>
  seedLegacySecretApprovalPolicy(getDb(), {
    projectId,
    environment: envSlug,
    secretPath,
    name: "legacy-policy",
    approverUserId: seedData1.id
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

describe("Secret approval policy routing", () => {
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

  test("a policy that only exists in the legacy tables is not served", async () => {
    const legacyId = (await seedLegacyPolicy(LEGACY_PATH)).id;
    legacyIds.push(legacyId);

    expect((await getPolicy(legacyId)).statusCode).toBe(404);
    expect((await updatePolicy(legacyId, { name: "legacy-renamed" })).statusCode).toBe(404);
    expect((await deletePolicy(legacyId)).statusCode).toBe(404);
    expect(await legacyRow(legacyId)).toMatchObject({ name: "legacy-policy", deletedAt: null });

    const listRes = await listPolicies();
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().approvals.map((policy: { id: string }) => policy.id)).not.toContain(legacyId);

    const boardRes = await getBoardPolicy(LEGACY_PATH);
    expect(boardRes.statusCode).toBe(200);
    expect(boardRes.json().policy).toBeUndefined();
  });

  test("a policy created on a path only a legacy policy covers lands on the global approval system tables", async () => {
    const createRes = await createBridgePolicy(LEGACY_PATH);
    expect(createRes.statusCode).toBe(200);
    const bridgeId = createRes.json().approval.id as string;
    bridgeIds.push(bridgeId);

    expect(await bridgeRow(bridgeId)).toMatchObject({ type: ApprovalPolicyType.SecretChange, projectId });
    expect(await bridgeEnvRows(bridgeId)).toMatchObject([{ policyId: bridgeId, envId, secretPath: LEGACY_PATH }]);
    expect(createRes.json().approval).toMatchObject({
      id: bridgeId,
      secretPath: LEGACY_PATH,
      approvals: 1,
      envId,
      environment: { id: envId, slug: envSlug },
      environments: [{ id: envId, slug: envSlug }]
    });
  });

  test("a delegated approval system is refused on create and update", async () => {
    const delegatedApproval = {
      type: DelegatedApprovalPolicyType.ServiceNow,
      connectionId: "00000000-0000-0000-0000-000000000000"
    };
    const message =
      "Only secret access policies can be handled by a delegated approval system. Remove delegatedApproval from the request.";

    const createRes = await testServer.inject({
      method: "POST",
      url: "/api/v2/secret-approvals",
      headers: authHeaders(),
      body: {
        projectId,
        environment: envSlug,
        secretPath: TAKEN_PATH,
        approvers,
        approvals: 1,
        name: "delegated-policy",
        delegatedApproval
      }
    });
    expect(createRes.statusCode).toBe(400);
    expect(createRes.json().message).toBe(message);

    const [bridgeId] = bridgeIds;
    const updateRes = await updatePolicy(bridgeId, { delegatedApproval });
    expect(updateRes.statusCode).toBe(400);
    expect(updateRes.json().message).toBe(message);
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

  test("an update is refused only when another policy on the global approval system covers the path", async () => {
    const legacyId = (await seedLegacyPolicy(NEW_PATH)).id;
    legacyIds.push(legacyId);
    const takenRes = await createBridgePolicy(TAKEN_PATH);
    expect(takenRes.statusCode).toBe(200);
    bridgeIds.push(takenRes.json().approval.id as string);
    const [bridgeId] = bridgeIds;

    const ontoGlobal = await updatePolicy(bridgeId, { secretPath: TAKEN_PATH });
    expect(ontoGlobal.statusCode).toBe(400);
    expect(ontoGlobal.json().message).toBe(
      `A policy for secret path '${TAKEN_PATH}' already exists in environment '${envSlug}'`
    );

    const ontoLegacy = await updatePolicy(bridgeId, { secretPath: NEW_PATH });
    expect(ontoLegacy.statusCode).toBe(200);
    expect(await bridgeEnvRows(bridgeId)).toMatchObject([{ envId, secretPath: NEW_PATH }]);

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

  test("a secret path is resolved with the exact path winning over a glob", async () => {
    const globRes = await createBridgePolicy(`${GLOB_BASE}/**`);
    expect(globRes.statusCode).toBe(200);
    const globId = globRes.json().approval.id as string;
    bridgeIds.push(globId);

    const exactRes = await createBridgePolicy(`${GLOB_BASE}/svc`);
    expect(exactRes.statusCode).toBe(200);
    const exactId = exactRes.json().approval.id as string;
    bridgeIds.push(exactId);

    const exactBoard = await getBoardPolicy(`${GLOB_BASE}/svc`);
    expect(exactBoard.statusCode).toBe(200);
    expect(exactBoard.json().policy).toMatchObject({ id: exactId, secretPath: `${GLOB_BASE}/svc` });

    const globBoard = await getBoardPolicy(`${GLOB_BASE}/other`);
    expect(globBoard.statusCode).toBe(200);
    expect(globBoard.json().policy).toMatchObject({ id: globId, secretPath: `${GLOB_BASE}/**` });
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
    expect(softDeleteRes.json().message).toBe("Environment is in use by an approval policy");

    const hardDeleteRes = await deleteEnv(true);
    expect(hardDeleteRes.statusCode).toBe(400);
    expect(hardDeleteRes.json().message).toBe("Environment is in use by an approval policy");

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

  test("a migrated policy's legacy twin is never served or written", async () => {
    const createRes = await createBridgePolicy(MIGRATED_PATH);
    expect(createRes.statusCode).toBe(200);
    const policyId = createRes.json().approval.id as string;
    bridgeIds.push(policyId);
    await seedLegacySecretApprovalPolicy(getDb(), {
      id: policyId,
      projectId,
      environment: envSlug,
      secretPath: MIGRATED_PATH,
      name: "migrated-twin",
      approverUserId: seedData1.id
    });
    legacyIds.push(policyId);

    const renamed = await updatePolicy(policyId, { name: "migrated-renamed" });
    expect(renamed.statusCode).toBe(200);
    expect(await legacyRow(policyId)).toMatchObject({ name: "migrated-twin" });
    expect(await bridgeRow(policyId)).toMatchObject({ name: "migrated-renamed" });

    const listRes = await listPolicies();
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().approvals.filter((policy: { id: string }) => policy.id === policyId)).toHaveLength(1);

    const deleteRes = await deletePolicy(policyId);
    expect(deleteRes.statusCode).toBe(200);
    expect(await bridgeRow(policyId)).toBeUndefined();
    expect(await legacyRow(policyId)).toMatchObject({ name: "migrated-twin", deletedAt: null });

    expect((await getPolicy(policyId)).statusCode).toBe(404);
    const afterDelete = await listPolicies();
    expect(afterDelete.json().approvals.map((policy: { id: string }) => policy.id)).not.toContain(policyId);
    const boardRes = await getBoardPolicy(MIGRATED_PATH);
    expect(boardRes.json().policy).toBeUndefined();
  });

  test("the deprecated v1 create puts a policy on a V3 project on the global approval system", async () => {
    const createRes = await testServer.inject({
      method: "POST",
      url: "/api/v1/secret-approvals",
      headers: authHeaders(),
      body: {
        workspaceId: projectId,
        environment: envSlug,
        secretPath: V1_PATH,
        approvers,
        approvals: 1,
        name: "v1-policy"
      }
    });
    expect(createRes.statusCode).toBe(200);
    const policyId = createRes.json().approval.id as string;
    bridgeIds.push(policyId);

    expect(await bridgeRow(policyId)).toMatchObject({ type: ApprovalPolicyType.SecretChange, projectId });
    expect(await bridgeEnvRows(policyId)).toMatchObject([{ policyId, envId, secretPath: V1_PATH }]);
  });
});
