import { createFolder, deleteFolder } from "e2e-test/testUtils/folders";
import { seedLegacySecretApprovalPolicy } from "e2e-test/testUtils/secret-approval-policies";
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

const createPolicy = (url: string, secretPath: string, name: string) =>
  testServer.inject({
    method: "POST",
    url,
    headers: authHeaders(),
    body: { workspaceId: projectId, projectId, environment: envSlug, secretPath, approvers, approvals: 1, name }
  });

const requestsForFolder = (folderId: string) => getDb()(TableName.SecretApprovalRequest).where({ folderId });

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

    const bridgeRes = await createPolicy("/api/v2/secret-approvals", `/${BRIDGE_FOLDER}`, "move-bridge-policy");
    expect(bridgeRes.statusCode).toBe(200);
    bridgePolicyId = bridgeRes.json().approval.id as string;

    const tagRes = await createTag("sar-move-bridge-tag");
    expect(tagRes.statusCode).toBe(200);
    tagId = tagRes.json().tag.id as string;
  });

  afterAll(async () => {
    const db = getDb();
    await db(TableName.SecretApprovalRequest).whereIn("folderId", Object.values(folderIds)).del();
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

  test("a move into a path governed by a legacy policy opens a request on the legacy tables", async () => {
    const createRes = await createSecret(`/${SOURCE_FOLDER}`, "MOVE_TO_LEGACY");
    expect(createRes.statusCode).toBe(200);
    const secretId = createRes.json().secret.id as string;

    const moveRes = await moveSecrets(`/${LEGACY_FOLDER}`, [secretId]);
    expect(moveRes.statusCode).toBe(200);
    expect(moveRes.json()).toMatchObject({ isSourceUpdated: true, isDestinationUpdated: false });

    const requests = await requestsForFolder(folderIds[LEGACY_FOLDER]);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ policyId: legacyPolicyId, status: "open", committerUserId: seedData1.id });
    const commits = await getDb()(TableName.SecretApprovalRequestSecretV2).where({ requestId: requests[0].id });
    expect(commits).toMatchObject([{ key: "MOVE_TO_LEGACY", op: "create" }]);
  });

  test("a tagged secret moved into a path governed by a legacy policy carries its tag onto the request commit", async () => {
    const createRes = await createSecret(`/${SOURCE_FOLDER}`, "MOVE_TAGGED_TO_LEGACY", [tagId]);
    expect(createRes.statusCode).toBe(200);
    const secretId = createRes.json().secret.id as string;

    const moveRes = await moveSecrets(`/${LEGACY_FOLDER}`, [secretId]);
    expect(moveRes.statusCode).toBe(200);

    const requests = await requestsForFolder(folderIds[LEGACY_FOLDER]);
    const requestIds = requests.map((request) => request.id);
    const [commit] = await getDb()(TableName.SecretApprovalRequestSecretV2)
      .whereIn("requestId", requestIds)
      .where({ key: "MOVE_TAGGED_TO_LEGACY" });
    expect(commit).toBeDefined();

    const tagRows = await getDb()(TableName.SecretApprovalRequestSecretTagV2).where({ secretId: commit.id });
    expect(tagRows).toMatchObject([{ secretId: commit.id, tagId }]);
  });

  test("a move into a path governed by a policy on the global approval system opens a request there", async () => {
    const createRes = await createSecret(`/${SOURCE_FOLDER}`, "MOVE_TO_BRIDGE");
    expect(createRes.statusCode).toBe(200);
    const secretId = createRes.json().secret.id as string;

    const moveRes = await moveSecrets(`/${BRIDGE_FOLDER}`, [secretId]);
    expect(moveRes.statusCode).toBe(200);
    expect(moveRes.json()).toMatchObject({ isSourceUpdated: true, isDestinationUpdated: false });

    expect(await requestsForFolder(folderIds[BRIDGE_FOLDER])).toHaveLength(0);
    const changeRequests = await getDb()(TableName.SecretChangeRequests).where({ folderId: folderIds[BRIDGE_FOLDER] });
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
});
