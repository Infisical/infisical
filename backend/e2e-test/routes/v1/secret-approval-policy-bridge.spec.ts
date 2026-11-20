import { createEnvironment, deleteEnvironment } from "e2e-test/testUtils/environments";
import {
  createSecretApprovalPolicy,
  createSecretChangePolicy,
  deleteSecretChangePolicy,
  getSecretChangePolicy,
  getSecretChangePolicyForPath,
  listSecretChangePolicies,
  seedLegacySecretApprovalPolicy,
  updateSecretChangePolicy
} from "e2e-test/testUtils/secret-approval-policies";
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
const approvers = [{ type: ApproverType.User, id: seedData1.id }];

const seedLegacyPolicy = (secretPath: string) =>
  seedLegacySecretApprovalPolicy(getDb(), {
    projectId,
    environment: envSlug,
    secretPath,
    name: "legacy-policy",
    approverUserId: seedData1.id
  });

const policyBody = (secretPath: string, name: string) => ({
  projectId,
  environment: envSlug,
  secretPath,
  approvers,
  approvals: 1,
  name
});

const createBridgePolicy = (secretPath: string) =>
  createSecretChangePolicy({ body: policyBody(secretPath, "bridge-policy"), authToken: jwtAuthToken });

const updatePolicy = (policyId: string, body: Record<string, unknown>) =>
  updateSecretChangePolicy({ policyId, body: { approvers, approvals: 1, ...body }, authToken: jwtAuthToken });

const deletePolicy = (policyId: string) => deleteSecretChangePolicy({ policyId, authToken: jwtAuthToken });

const listPolicyIds = async () =>
  (await listSecretChangePolicies({ projectId, authToken: jwtAuthToken })).map((policy) => policy.id);

const getPolicy = (policyId: string) => getSecretChangePolicy({ policyId, authToken: jwtAuthToken });

const getBoardPolicy = (secretPath: string) =>
  getSecretChangePolicyForPath({ projectId, environment: envSlug, secretPath, authToken: jwtAuthToken });

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

    expect((await getPolicy(legacyId).raw()).statusCode).toBe(404);
    expect((await updatePolicy(legacyId, { name: "legacy-renamed" }).raw()).statusCode).toBe(404);
    expect((await deletePolicy(legacyId).raw()).statusCode).toBe(404);
    expect(await legacyRow(legacyId)).toMatchObject({ name: "legacy-policy", deletedAt: null });

    expect(await listPolicyIds()).not.toContain(legacyId);
    expect(await getBoardPolicy(LEGACY_PATH)).toBeUndefined();
  });

  test("a policy created on a path only a legacy policy covers lands on the global approval system tables", async () => {
    const policy = await createBridgePolicy(LEGACY_PATH);
    bridgeIds.push(policy.id);

    expect(await bridgeRow(policy.id)).toMatchObject({ type: ApprovalPolicyType.SecretChange, projectId });
    expect(await bridgeEnvRows(policy.id)).toMatchObject([{ policyId: policy.id, envId, secretPath: LEGACY_PATH }]);
    expect(policy).toMatchObject({
      id: policy.id,
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

    const createRes = await createSecretChangePolicy({
      body: { ...policyBody(TAKEN_PATH, "delegated-policy"), delegatedApproval },
      authToken: jwtAuthToken
    }).raw();
    expect(createRes.statusCode).toBe(400);
    expect(createRes.json().message).toBe(message);

    const [bridgeId] = bridgeIds;
    const updateRes = await updatePolicy(bridgeId, { delegatedApproval }).raw();
    expect(updateRes.statusCode).toBe(400);
    expect(updateRes.json().message).toBe(message);
  });

  test("a policy on the global approval system is read back through the legacy routes", async () => {
    const [bridgeId] = bridgeIds;

    expect(await listSecretChangePolicies({ projectId, authToken: jwtAuthToken })).toContainEqual(
      expect.objectContaining({
        id: bridgeId,
        secretPath: LEGACY_PATH,
        approvers: [{ id: seedData1.id, type: ApproverType.User }],
        bypassers: []
      })
    );

    expect(await getPolicy(bridgeId)).toMatchObject({
      id: bridgeId,
      secretPath: LEGACY_PATH,
      approvals: 1,
      deletedAt: null,
      environment: { id: envId, slug: envSlug },
      environments: [{ id: envId, slug: envSlug }],
      approvers: [{ id: seedData1.id, type: ApproverType.User, username: seedData1.email }],
      bypassers: []
    });

    expect(await getBoardPolicy(LEGACY_PATH)).toMatchObject({
      id: bridgeId,
      secretPath: LEGACY_PATH,
      userApprovers: [{ userId: seedData1.id }]
    });

    expect((await getPolicy("00000000-0000-0000-0000-000000000000").raw()).statusCode).toBe(404);
  });

  test("an update is refused only when another policy on the global approval system covers the path", async () => {
    const legacyId = (await seedLegacyPolicy(NEW_PATH)).id;
    legacyIds.push(legacyId);
    bridgeIds.push((await createBridgePolicy(TAKEN_PATH)).id);
    const [bridgeId] = bridgeIds;

    const ontoGlobal = await updatePolicy(bridgeId, { secretPath: TAKEN_PATH }).raw();
    expect(ontoGlobal.statusCode).toBe(400);
    expect(ontoGlobal.json().message).toBe(
      `A policy for secret path '${TAKEN_PATH}' already exists in environment '${envSlug}'`
    );

    await updatePolicy(bridgeId, { secretPath: NEW_PATH });
    expect(await bridgeEnvRows(bridgeId)).toMatchObject([{ envId, secretPath: NEW_PATH }]);

    await updatePolicy(bridgeId, { name: "bridge-renamed" });
    expect(await bridgeRow(bridgeId)).toMatchObject({ name: "bridge-renamed" });
  });

  test("a policy on the global approval system is updated in place and hard-deleted", async () => {
    const [bridgeId] = bridgeIds;

    const updated = await updatePolicy(bridgeId, {
      name: "bridge-moved",
      approvals: 1,
      secretPath: MOVED_PATH,
      allowedSelfApprovals: false
    });
    expect(updated).toMatchObject({
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

    const deleted = await deletePolicy(bridgeId);
    expect(deleted).toMatchObject({ id: bridgeId, secretPath: MOVED_PATH });
    expect(deleted.deletedAt).not.toBeNull();
    expect(await bridgeRow(bridgeId)).toBeUndefined();
    expect(await bridgeEnvRows(bridgeId)).toHaveLength(0);
    expect(await bridgeStep(bridgeId)).toBeUndefined();

    // Pins the current gap: the bridge does not cancel pending requests the way legacy closes open ones.
    // Flip this to expect "cancelled" when secret change requests move onto the global approval system.
    expect(await getDb()(TableName.ApprovalRequests).where({ id: requestId }).first()).toMatchObject({
      status: "pending",
      policyId: null
    });

    bridgeIds.push((await createBridgePolicy(MOVED_PATH)).id);
  });

  test("a secret path is resolved with the exact path winning over a glob", async () => {
    const globId = (await createBridgePolicy(`${GLOB_BASE}/**`)).id;
    bridgeIds.push(globId);
    const exactId = (await createBridgePolicy(`${GLOB_BASE}/svc`)).id;
    bridgeIds.push(exactId);

    expect(await getBoardPolicy(`${GLOB_BASE}/svc`)).toMatchObject({ id: exactId, secretPath: `${GLOB_BASE}/svc` });
    expect(await getBoardPolicy(`${GLOB_BASE}/other`)).toMatchObject({ id: globId, secretPath: `${GLOB_BASE}/**` });
  });

  test("an environment used by a policy on the global approval system cannot be deleted", async () => {
    const guardedSlug = "sap-bridge-env-delete";
    const guardedEnvId = (
      await createEnvironment({ projectId, name: "SAP bridge env delete", slug: guardedSlug, authToken: jwtAuthToken })
    ).id;
    createdEnvIds.push(guardedEnvId);

    const bridgeId = (
      await createSecretChangePolicy({
        body: { ...policyBody("/", "env-delete-guard"), environment: guardedSlug },
        authToken: jwtAuthToken
      })
    ).id;
    bridgeIds.push(bridgeId);
    expect(await bridgeRow(bridgeId)).toMatchObject({ type: ApprovalPolicyType.SecretChange });

    const deleteEnv = (hardDelete: boolean) =>
      deleteEnvironment({ projectId, environmentId: guardedEnvId, hardDelete, authToken: jwtAuthToken });

    const softDeleteRes = await deleteEnv(false).raw();
    expect(softDeleteRes.statusCode).toBe(400);
    expect(softDeleteRes.json().message).toBe("Environment is in use by an approval policy");

    const hardDeleteRes = await deleteEnv(true).raw();
    expect(hardDeleteRes.statusCode).toBe(400);
    expect(hardDeleteRes.json().message).toBe("Environment is in use by an approval policy");

    expect(await getDb()(TableName.Environment).where({ id: guardedEnvId }).first()).toMatchObject({
      deleteAfter: null
    });
    expect(await bridgeEnvRows(bridgeId)).toMatchObject([{ envId: guardedEnvId }]);

    await deletePolicy(bridgeId);
    expect((await deleteEnv(true)).id).toBe(guardedEnvId);
  });

  test("a migrated policy's legacy twin is never served or written", async () => {
    const policyId = (await createBridgePolicy(MIGRATED_PATH)).id;
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

    await updatePolicy(policyId, { name: "migrated-renamed" });
    expect(await legacyRow(policyId)).toMatchObject({ name: "migrated-twin" });
    expect(await bridgeRow(policyId)).toMatchObject({ name: "migrated-renamed" });

    expect((await listPolicyIds()).filter((id) => id === policyId)).toHaveLength(1);

    await deletePolicy(policyId);
    expect(await bridgeRow(policyId)).toBeUndefined();
    expect(await legacyRow(policyId)).toMatchObject({ name: "migrated-twin", deletedAt: null });

    expect((await getPolicy(policyId).raw()).statusCode).toBe(404);
    expect(await listPolicyIds()).not.toContain(policyId);
    expect(await getBoardPolicy(MIGRATED_PATH)).toBeUndefined();
  });

  test("the deprecated v1 create puts a policy on a V3 project on the global approval system", async () => {
    const policyId = (
      await createSecretApprovalPolicy({
        projectId,
        environmentSlug: envSlug,
        secretPath: V1_PATH,
        approverUserIds: [seedData1.id],
        authToken: jwtAuthToken
      })
    ).id;
    bridgeIds.push(policyId);

    expect(await bridgeRow(policyId)).toMatchObject({ type: ApprovalPolicyType.SecretChange, projectId });
    expect(await bridgeEnvRows(policyId)).toMatchObject([{ policyId, envId, secretPath: V1_PATH }]);
  });
});
