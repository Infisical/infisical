import crypto from "node:crypto";

import { Knex } from "knex";

import { up } from "@app/db/migrations/20261014120100_migrate-secret-approval-policies-to-global";
import { TableName } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";

const getDb = () => (globalThis as unknown as { testDb: Knex }).testDb;

const orgId = seedData1.organization.id;
const authHeaders = () => ({ authorization: `Bearer ${jwtAuthToken}` });
const MIGRATED_PATH = "/sap-migration";

type TSeededRequest = { id: string; commitIds: string[] };

const seedLegacyPolicy = async (
  db: Knex,
  dto: { projectId: string; name: string; approvals: number; approverUserId: string; approverGroupId?: string }
) => {
  const env = await db(TableName.Environment)
    .where({ projectId: dto.projectId, slug: seedData1.environment.slug })
    .first();
  if (!env) throw new Error("seeded environment not found");

  const [policy] = await db(TableName.SecretApprovalPolicy)
    .insert({
      name: dto.name,
      secretPath: MIGRATED_PATH,
      approvals: dto.approvals,
      envId: env.id,
      enforcementLevel: "soft",
      allowedSelfApprovals: false,
      bypassForMachineIdentities: true
    })
    .returning("*");
  await db(TableName.SecretApprovalPolicyEnvironment).insert({ policyId: policy.id, envId: env.id });
  await db(TableName.SecretApprovalPolicyApprover).insert({ policyId: policy.id, approverUserId: dto.approverUserId });
  if (dto.approverGroupId) {
    await db(TableName.SecretApprovalPolicyApprover).insert({
      policyId: policy.id,
      approverGroupId: dto.approverGroupId
    });
  }
  await db(TableName.SecretApprovalPolicyBypasser).insert({ policyId: policy.id, bypasserUserId: dto.approverUserId });
  return { policyId: policy.id as string, envId: env.id as string };
};

const seedLegacyRequest = async (
  db: Knex,
  dto: {
    policyId: string;
    folderId: string;
    status: "open" | "close";
    committerUserId?: string | null;
    committerIdentityId?: string | null;
    hasMerged?: boolean;
    bypassReason?: string | null;
    conflicts?: unknown;
    statusChangedByUserId?: string | null;
    commits: number;
  }
): Promise<TSeededRequest> => {
  const [request] = await db(TableName.SecretApprovalRequest)
    .insert({
      policyId: dto.policyId,
      folderId: dto.folderId,
      slug: `sap-migration-${crypto.randomUUID().slice(0, 8)}`,
      status: dto.status,
      committerUserId: dto.committerUserId ?? null,
      committerIdentityId: dto.committerIdentityId ?? null,
      hasMerged: dto.hasMerged ?? false,
      bypassReason: dto.bypassReason ?? null,
      conflicts: dto.conflicts === undefined ? null : JSON.stringify(dto.conflicts),
      statusChangedByUserId: dto.statusChangedByUserId ?? null,
      commitMessage: "seeded by the migration spec"
    })
    .returning("id");
  const requestId = (request as { id: string }).id;

  const commitIds: string[] = [];
  for (let index = 0; index < dto.commits; index += 1) {
    // eslint-disable-next-line no-await-in-loop
    const [commit] = await db(TableName.SecretApprovalRequestSecretV2)
      .insert({ requestId, key: `SAP_MIGRATION_${index}`, op: "create", skipMultilineEncoding: false })
      .returning("id");
    commitIds.push((commit as { id: string }).id);
  }
  return { id: requestId, commitIds };
};

const commitsOf = (db: Knex, commitIds: string[]) =>
  db(TableName.SecretApprovalRequestSecretV2).whereIn("id", commitIds).select("id", "requestId", "secretChangeId");

describe("Legacy secret approval policies migrate to the global approval system", () => {
  const db = getDb();
  let groupId: string;
  let v3PolicyId: string;
  let v1PolicyId: string;
  let openRequest: TSeededRequest;
  let mergedRequest: TSeededRequest;
  let identityRequest: TSeededRequest;
  let orphanRequest: TSeededRequest;
  let v1Request: TSeededRequest;

  beforeAll(async () => {
    const slug = `sap-migration-${crypto.randomUUID().slice(0, 8)}`;
    const [group] = await db(TableName.Groups).insert({ orgId, name: slug, slug }).returning("id");
    groupId = (group as { id: string }).id;
    await db(TableName.UserGroupMembership).insert({ groupId, userId: seedData1.id });

    const v3 = await seedLegacyPolicy(db, {
      projectId: seedData1.projectV3.id,
      name: "sap-migration-v3",
      approvals: 1,
      approverUserId: seedData1.id,
      approverGroupId: groupId
    });
    v3PolicyId = v3.policyId;
    const v3Folder = await db(TableName.SecretFolder).where({ envId: v3.envId, parentId: null }).first();
    if (!v3Folder) throw new Error("root folder of the V3 project not found");

    openRequest = await seedLegacyRequest(db, {
      policyId: v3PolicyId,
      folderId: v3Folder.id,
      status: "open",
      committerUserId: seedData1.id,
      commits: 2
    });
    await db(TableName.SecretApprovalRequestReviewer).insert({
      requestId: openRequest.id,
      reviewerUserId: seedData1.id,
      status: "approved",
      comment: "ship it"
    });
    mergedRequest = await seedLegacyRequest(db, {
      policyId: v3PolicyId,
      folderId: v3Folder.id,
      status: "close",
      committerUserId: seedData1.id,
      hasMerged: true,
      bypassReason: "incident 42 needed the key right away",
      conflicts: [{ op: "update", secretId: crypto.randomUUID() }],
      statusChangedByUserId: seedData1.id,
      commits: 1
    });
    identityRequest = await seedLegacyRequest(db, {
      policyId: v3PolicyId,
      folderId: v3Folder.id,
      status: "open",
      committerIdentityId: seedData1.machineIdentity.id,
      commits: 1
    });
    orphanRequest = await seedLegacyRequest(db, {
      policyId: v3PolicyId,
      folderId: v3Folder.id,
      status: "close",
      committerUserId: null,
      commits: 0
    });

    const v1 = await seedLegacyPolicy(db, {
      projectId: seedData1.project.id,
      name: "sap-migration-v1",
      approvals: 1,
      approverUserId: seedData1.id
    });
    v1PolicyId = v1.policyId;
    const v1Folder = await db(TableName.SecretFolder).where({ envId: v1.envId, parentId: null }).first();
    if (!v1Folder) throw new Error("root folder of the V1 project not found");
    v1Request = await seedLegacyRequest(db, {
      policyId: v1PolicyId,
      folderId: v1Folder.id,
      status: "open",
      committerUserId: seedData1.id,
      commits: 1
    });
  });

  afterAll(async () => {
    await db(TableName.ApprovalPolicies).whereIn("id", [v3PolicyId, v1PolicyId]).del();
    await db(TableName.ApprovalRequests)
      .whereIn("id", [openRequest.id, mergedRequest.id, identityRequest.id, orphanRequest.id, v1Request.id])
      .del();
    await db(TableName.SecretApprovalPolicy).whereIn("id", [v3PolicyId, v1PolicyId]).del();
    await db(TableName.UserGroupMembership).where({ groupId }).del();
    await db(TableName.Groups).where({ id: groupId }).del();
  });

  test("up moves a V3 policy with its requests, reviews and commits and leaves a V1 policy on legacy", async () => {
    await up(db);

    expect(await db(TableName.ApprovalPolicies).where({ id: v3PolicyId }).first()).toMatchObject({
      type: "secret-change",
      projectId: seedData1.projectV3.id,
      organizationId: orgId,
      name: "sap-migration-v3",
      enforcementLevel: "soft",
      bypassForMachineIdentities: true,
      constraints: { version: 1, constraints: { allowedSelfApprovals: false } }
    });
    const steps = await db(TableName.ApprovalPolicySteps).where({ policyId: v3PolicyId });
    expect(steps).toMatchObject([{ stepNumber: 1, requiredApprovals: 1 }]);
    const stepApprovers = await db(TableName.ApprovalPolicyStepApprovers).where({ policyStepId: steps[0].id });
    expect(stepApprovers).toHaveLength(2);
    expect(stepApprovers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: seedData1.id, groupId: null }),
        expect.objectContaining({ userId: null, groupId })
      ])
    );
    expect(await db(TableName.ApprovalPolicyBypassers).where({ policyId: v3PolicyId })).toMatchObject([
      { userId: seedData1.id, groupId: null }
    ]);
    expect(await db(TableName.ApprovalPolicySecretEnvironment).where({ policyId: v3PolicyId })).toMatchObject([
      { secretPath: MIGRATED_PATH }
    ]);

    expect(await db(TableName.ApprovalRequests).where({ id: openRequest.id }).first()).toMatchObject({
      type: "secret-change",
      status: "open",
      policyId: v3PolicyId,
      requesterId: seedData1.id,
      requesterEmail: seedData1.email,
      currentStep: 1
    });
    const [openStep] = await db(TableName.ApprovalRequestSteps).where({ requestId: openRequest.id });
    expect(openStep).toMatchObject({ stepNumber: 1, status: "in-progress", requiredApprovals: 1, completedAt: null });
    expect(await db(TableName.ApprovalRequestApprovals).where({ stepId: openStep.id })).toMatchObject([
      { approverUserId: seedData1.id, decision: "approved", comment: "ship it" }
    ]);
    const openChange = await db(TableName.SecretChangeRequests).where({ approvalRequestId: openRequest.id }).first();
    expect(openChange).toMatchObject({ hasMerged: false, commitMessage: "seeded by the migration spec" });
    expect(await commitsOf(db, openRequest.commitIds)).toEqual(
      openRequest.commitIds.map((id) => ({ id, requestId: null, secretChangeId: openChange?.id }))
    );

    expect(await db(TableName.ApprovalRequests).where({ id: mergedRequest.id }).first()).toMatchObject({
      status: "close"
    });
    const mergedChange = await db(TableName.SecretChangeRequests)
      .where({ approvalRequestId: mergedRequest.id })
      .first();
    expect(mergedChange).toMatchObject({
      hasMerged: true,
      bypassReason: "incident 42 needed the key right away",
      statusChangedByUserId: seedData1.id,
      conflicts: [{ op: "update", secretId: expect.any(String) as string }]
    });
    expect(await commitsOf(db, mergedRequest.commitIds)).toEqual(
      mergedRequest.commitIds.map((id) => ({ id, requestId: null, secretChangeId: mergedChange?.id }))
    );

    expect(await db(TableName.ApprovalRequests).where({ id: identityRequest.id }).first()).toMatchObject({
      requesterId: null,
      machineIdentityId: seedData1.machineIdentity.id,
      requesterName: seedData1.machineIdentity.name,
      requesterEmail: ""
    });
    expect(await db(TableName.ApprovalRequests).where({ id: orphanRequest.id }).first()).toMatchObject({
      requesterId: null,
      machineIdentityId: null,
      requesterName: "",
      requesterEmail: ""
    });

    expect(await db(TableName.ApprovalPolicies).where({ id: v1PolicyId }).first()).toBeUndefined();
    expect(await db(TableName.ApprovalRequests).where({ id: v1Request.id }).first()).toBeUndefined();
    expect(await commitsOf(db, v1Request.commitIds)).toMatchObject([{ requestId: v1Request.id, secretChangeId: null }]);
  });

  test("the migrated policy and its requests are served once, from the global approval system", async () => {
    const listRes = await testServer.inject({
      method: "GET",
      url: `/api/v2/secret-approvals?projectId=${seedData1.projectV3.id}`,
      headers: authHeaders()
    });
    expect(listRes.statusCode).toBe(200);
    const policies = listRes.json().approvals.filter((policy: { id: string }) => policy.id === v3PolicyId);
    expect(policies).toHaveLength(1);
    expect(policies[0]).toMatchObject({ name: "sap-migration-v3", approvals: 1, allowedSelfApprovals: false });

    const requestRes = await testServer.inject({
      method: "GET",
      url: `/api/v1/secret-approval-requests/${openRequest.id}`,
      headers: authHeaders()
    });
    expect(requestRes.statusCode).toBe(200);
    const { approval } = requestRes.json();
    expect(approval).toMatchObject({
      id: openRequest.id,
      status: "open",
      policy: { id: v3PolicyId },
      reviewers: [{ userId: seedData1.id, status: "approved", comment: "ship it" }]
    });
    expect(approval.commits.map((commit: { secretKey: string }) => commit.secretKey).sort()).toEqual([
      "SAP_MIGRATION_0",
      "SAP_MIGRATION_1"
    ]);

    const listRequests = await testServer.inject({
      method: "GET",
      url: `/api/v1/secret-approval-requests?projectId=${seedData1.projectV3.id}&limit=50`,
      headers: authHeaders()
    });
    expect(listRequests.statusCode).toBe(200);
    const listed = listRequests.json().approvals.filter((row: { id: string }) => row.id === openRequest.id);
    expect(listed).toHaveLength(1);
  });

  test("a second run leaves everything as it is", async () => {
    const before = await db(TableName.ApprovalRequests).where({ policyId: v3PolicyId }).count().first();

    await up(db);

    const after = await db(TableName.ApprovalRequests).where({ policyId: v3PolicyId }).count().first();
    expect(after).toEqual(before);
    expect(await db(TableName.ApprovalPolicies).where({ id: v1PolicyId }).first()).toBeUndefined();
  });
});
