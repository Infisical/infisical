import { createFolder, deleteFolder } from "e2e-test/testUtils/folders";
import { createSecretChangePolicy, seedLegacySecretApprovalPolicy } from "e2e-test/testUtils/secret-approval-policies";
import { Knex } from "knex";

import { SecretType, TableName } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { ApproverType } from "@app/ee/services/access-approval-policy/access-approval-policy-types";
import { ApprovalPolicyType, ApprovalRequestStatus } from "@app/services/approval-policy/approval-policy-enums";

const getDb = () => (globalThis as unknown as { testDb: Knex }).testDb;

const projectId = seedData1.projectV3.id;
const envSlug = seedData1.environment.slug;
const SOURCE_FOLDER = "sar-move-bridge-source";
const LEGACY_FOLDER = "sar-move-bridge-legacy";
const BRIDGE_FOLDER = "sar-move-bridge-new";
const authHeaders = () => ({ authorization: `Bearer ${jwtAuthToken}` });
const approvers = [{ type: ApproverType.User, id: seedData1.id }];

const createSecret = (secretPath: string, key: string, tagIds?: string[]) =>
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
      secretValue: "value",
      tagIds
    }
  });

const createTag = (slug: string) =>
  testServer.inject({
    method: "POST",
    url: `/api/v1/projects/${projectId}/tags`,
    headers: authHeaders(),
    body: { slug, color: "#ff0000" }
  });

const deleteTag = (tagId: string) =>
  testServer.inject({ method: "DELETE", url: `/api/v1/projects/${projectId}/tags/${tagId}`, headers: authHeaders() });

const moveSecrets = (destinationSecretPath: string, secretIds: string[]) =>
  testServer.inject({
    method: "POST",
    url: "/api/v4/secrets/move",
    headers: authHeaders(),
    body: {
      projectId,
      sourceEnvironment: envSlug,
      sourceSecretPath: `/${SOURCE_FOLDER}`,
      destinationEnvironment: envSlug,
      destinationSecretPath,
      secretIds,
      shouldOverwrite: false
    }
  });

const createPolicy = (secretPath: string, name: string) =>
  createSecretChangePolicy({
    body: { projectId, environment: envSlug, secretPath, approvers, approvals: 1, name },
    authToken: jwtAuthToken
  });

const changeRequestsForFolder = (folderId: string) => getDb()(TableName.SecretChangeRequests).where({ folderId });

describe("Secret move under a secret approval policy", () => {
  const folderIds: Record<string, string> = {};
  let legacyPolicyId: string;
  let bridgePolicyId: string;
  let tagId: string;

  beforeAll(async () => {
    for await (const name of [SOURCE_FOLDER, LEGACY_FOLDER, BRIDGE_FOLDER]) {
      const folder = await createFolder({
        workspaceId: projectId,
        environmentSlug: envSlug,
        secretPath: "/",
        name,
        authToken: jwtAuthToken
      });
      folderIds[name] = folder.id;
    }

    legacyPolicyId = (
      await seedLegacySecretApprovalPolicy(getDb(), {
        projectId,
        environment: envSlug,
        secretPath: `/${LEGACY_FOLDER}`,
        name: "move-legacy-policy",
        approverUserId: seedData1.id
      })
    ).id;

    bridgePolicyId = (await createPolicy(`/${BRIDGE_FOLDER}`, "move-bridge-policy")).id;

    const tagRes = await createTag("sar-move-bridge-tag");
    expect(tagRes.statusCode).toBe(200);
    tagId = tagRes.json().tag.id as string;
  });

  afterAll(async () => {
    const db = getDb();
    await db(TableName.ApprovalRequests)
      .whereIn(
        "id",
        db(TableName.SecretChangeRequests).select("approvalRequestId").whereIn("folderId", Object.values(folderIds))
      )
      .del();
    await db(TableName.SecretApprovalPolicy).where({ id: legacyPolicyId }).del();
    await db(TableName.ApprovalPolicies).where({ id: bridgePolicyId }).del();
    await deleteTag(tagId);
    for await (const [name, id] of Object.entries(folderIds)) {
      await deleteFolder({
        workspaceId: projectId,
        environmentSlug: envSlug,
        secretPath: "/",
        id,
        authToken: jwtAuthToken,
        forceDelete: true
      });
      expect(name).toBeDefined();
    }
  });

  test("a move into a path only a legacy policy covers is applied directly", async () => {
    const createRes = await createSecret(`/${SOURCE_FOLDER}`, "MOVE_TO_LEGACY");
    expect(createRes.statusCode).toBe(200);
    const secretId = createRes.json().secret.id as string;

    const moveRes = await moveSecrets(`/${LEGACY_FOLDER}`, [secretId]);
    expect(moveRes.statusCode).toBe(200);
    expect(moveRes.json()).toMatchObject({ isSourceUpdated: true, isDestinationUpdated: true });

    expect(await changeRequestsForFolder(folderIds[LEGACY_FOLDER])).toHaveLength(0);
    expect(await getDb()(TableName.SecretApprovalRequest).where({ policyId: legacyPolicyId })).toHaveLength(0);
    expect(
      await getDb()(TableName.SecretV2).where({ folderId: folderIds[LEGACY_FOLDER], key: "MOVE_TO_LEGACY" })
    ).toHaveLength(1);
  });

  test("a move into a path governed by a policy on the global approval system opens a request there", async () => {
    const createRes = await createSecret(`/${SOURCE_FOLDER}`, "MOVE_TO_BRIDGE");
    expect(createRes.statusCode).toBe(200);
    const secretId = createRes.json().secret.id as string;

    const moveRes = await moveSecrets(`/${BRIDGE_FOLDER}`, [secretId]);
    expect(moveRes.statusCode).toBe(200);
    expect(moveRes.json()).toMatchObject({ isSourceUpdated: true, isDestinationUpdated: false });

    const changeRequests = await changeRequestsForFolder(folderIds[BRIDGE_FOLDER]);
    expect(changeRequests).toHaveLength(1);
    const [changeRequest] = changeRequests;
    expect(changeRequest).toMatchObject({ hasMerged: false, isReplicated: null });
    expect(
      await getDb()(TableName.ApprovalRequests).where({ id: changeRequest.approvalRequestId }).first()
    ).toMatchObject({
      type: ApprovalPolicyType.SecretChange,
      status: ApprovalRequestStatus.Open,
      policyId: bridgePolicyId,
      requesterId: seedData1.id
    });
    expect(
      await getDb()(TableName.SecretApprovalRequestSecretV2).where({ secretChangeId: changeRequest.id })
    ).toMatchObject([{ key: "MOVE_TO_BRIDGE", op: "create", requestId: null }]);

    const detailsRes = await testServer.inject({
      method: "GET",
      url: `/api/v1/secret-approval-requests/${changeRequest.approvalRequestId}`,
      headers: authHeaders()
    });
    expect(detailsRes.statusCode).toBe(200);
    expect(detailsRes.json().approval).toMatchObject({
      policy: { id: bridgePolicyId },
      isReplicated: null,
      commits: [{ secretKey: "MOVE_TO_BRIDGE", op: "create" }]
    });

    expect(await getDb()(TableName.SecretV2).where({ id: secretId }).first()).toBeUndefined();
    expect(
      await getDb()(TableName.SecretV2).where({ folderId: folderIds[BRIDGE_FOLDER], key: "MOVE_TO_BRIDGE" })
    ).toHaveLength(0);
  });

  test("a tagged secret moved into a path governed by a policy on the global approval system carries its tag onto the request commit", async () => {
    const createRes = await createSecret(`/${SOURCE_FOLDER}`, "MOVE_TAGGED_TO_BRIDGE", [tagId]);
    expect(createRes.statusCode).toBe(200);
    const secretId = createRes.json().secret.id as string;

    const moveRes = await moveSecrets(`/${BRIDGE_FOLDER}`, [secretId]);
    expect(moveRes.statusCode).toBe(200);

    const changeRequestIds = (await changeRequestsForFolder(folderIds[BRIDGE_FOLDER])).map((request) => request.id);
    const [commit] = await getDb()(TableName.SecretApprovalRequestSecretV2)
      .whereIn("secretChangeId", changeRequestIds)
      .where({ key: "MOVE_TAGGED_TO_BRIDGE" });
    expect(commit).toBeDefined();

    const tagRows = await getDb()(TableName.SecretApprovalRequestSecretTagV2).where({ secretId: commit.id });
    expect(tagRows).toMatchObject([{ secretId: commit.id, tagId }]);
  });
});
