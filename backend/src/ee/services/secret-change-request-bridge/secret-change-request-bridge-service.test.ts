import { Knex } from "knex";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { ProjectMembershipRole } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import {
  ApprovalPolicyType,
  ApprovalRequestApprovalDecision,
  ApprovalRequestStatus,
  ApproverType
} from "@app/services/approval-policy/approval-policy-enums";
import { ActorType } from "@app/services/auth/auth-type";
import { INFISICAL_SECRET_VALUE_HIDDEN_MASK } from "@app/services/secret/secret-fns";
import { SecretOperations } from "@app/services/secret/secret-types";
import { ChangeRequestWebhookAction } from "@app/services/webhook/webhook-types";

import { ApprovalStatus, RequestState } from "../secret-approval-request/secret-approval-request-types";
import { secretChangeRequestBridgeServiceFactory } from "./secret-change-request-bridge-service";

const buildSecretApprovalCommits = vi.fn();
const resolveRequester = vi.fn();
const runSecretChangeRequestSideEffects = vi.fn().mockResolvedValue(undefined);
const queueChangeRequestWebhook = vi.fn().mockResolvedValue(undefined);
const detectSecretApprovalCommitConflicts = vi.fn();
const applySecretApprovalCommitsV2Bridge = vi.fn();
const findMergedFolder = vi.fn();
const syncMergedSecrets = vi.fn().mockResolvedValue(undefined);
const notifySecretApprovalBypass = vi.fn().mockResolvedValue(undefined);
const BLIND_INDEXER = { generateBlindIndexes: vi.fn() };

vi.mock("@app/lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));
vi.mock("../secret-approval-request/secret-approval-request-commit-fns", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../secret-approval-request/secret-approval-request-commit-fns")>()),
  secretApprovalRequestCommitFnsFactory: () => ({ buildSecretApprovalCommits, validateSecrets: vi.fn() })
}));
vi.mock("../secret-approval-request/secret-approval-request-merge-fns", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../secret-approval-request/secret-approval-request-merge-fns")>()),
  secretApprovalRequestMergeFnsFactory: () => ({
    detectSecretApprovalCommitConflicts,
    applySecretApprovalCommitsV2Bridge,
    findMergedFolder,
    syncMergedSecrets,
    notifySecretApprovalBypass
  })
}));
vi.mock("@app/services/secret-v2-bridge/secret-blind-index-fns", () => ({
  createSecretBlindIndexer: async () => BLIND_INDEXER
}));
vi.mock("./secret-change-request-bridge-fns", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./secret-change-request-bridge-fns")>()),
  secretChangeRequestFnsFactory: () => ({
    resolveRequester,
    queueChangeRequestWebhook,
    runSecretChangeRequestSideEffects
  })
}));

const CALLER_TX = { isTx: "caller" } as unknown as Knex;
const OWN_TX = { isTx: "own" } as unknown as Knex;
const POLICY = {
  id: "policy-1",
  name: "dev-policy",
  enforcementLevel: "hard",
  allowedSelfApprovals: true,
  bypassers: [] as { type: string; id: string }[],
  userApprovers: [{ userId: "approver-1" }]
};
const REVIEW_CREATED_AT = new Date("2026-02-01");
const APPROVAL_REQUEST = {
  id: "request-1",
  projectId: "project-1",
  organizationId: "org-1",
  policyId: "policy-1",
  requesterId: "user-1",
  type: ApprovalPolicyType.SecretChange,
  status: ApprovalRequestStatus.Open,
  currentStep: 1,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01")
};
const SECRET_CHANGE_REQUEST = {
  id: "change-1",
  approvalRequestId: "request-1",
  folderId: "folder-1",
  slug: "slug-1",
  hasMerged: false,
  bypassReason: null
};
const REQUEST_STEP = {
  id: "step-1",
  requestId: "request-1",
  stepNumber: 1,
  requiredApprovals: 1,
  approvers: [
    { type: ApproverType.User, id: "approver-1" },
    { type: ApproverType.Group, id: "group-1" }
  ],
  approvals: [] as { id: string; stepId: string; approverUserId: string; decision: ApprovalRequestApprovalDecision }[]
};
const PROJECT = { id: "project-1", name: "Project", orgId: "org-1" };
const REQUESTER = {
  requesterUserId: "user-1",
  machineIdentityId: null,
  requesterName: "Alice Smith",
  requesterEmail: "alice@example.com"
};
const BUNDLE = {
  folder: { id: "folder-1", envId: "env-1" },
  folderId: "folder-1",
  project: PROJECT,
  permission: {},
  commits: [
    { op: SecretOperations.Create, version: 1, key: "NEW_KEY", encryptedValue: Buffer.from("v"), type: "shared" },
    { op: SecretOperations.Delete, version: 3, key: "OLD_KEY", secretId: "secret-2", secretVersion: "version-2" }
  ],
  commitTagIds: { NEW_KEY: ["tag-1", "tag-2"] },
  tagIds: ["tag-1", "tag-2"],
  secretKeys: ["NEW_KEY", "OLD_KEY"]
};

const MERGED_FOLDER = {
  id: "folder-1",
  envId: "env-1",
  path: "/app",
  environmentSlug: "dev",
  environmentName: "Development"
};
const CIPHER = {
  cipher: "secret-manager",
  decryptor: ({ cipherTextBlob }: { cipherTextBlob: Buffer }) => Buffer.from(`plain:${cipherTextBlob.toString()}`)
};
const COMMIT_ROWS = [
  {
    id: "commit-1",
    op: SecretOperations.Create,
    key: "NEW_KEY",
    version: 1,
    secretId: null,
    secret: undefined,
    secretVersion: undefined,
    tags: [],
    oldSecretMetadata: []
  }
];
const APPLIED_SECRETS = {
  created: [{ id: "secret-1", key: "NEW_KEY", version: 1, tags: [], secretMetadata: [] }],
  updated: [],
  deleted: []
};

const buildService = ({
  policy = POLICY as typeof POLICY | null,
  steps = [{ requiredApprovals: 1, approvers: [{ type: ApproverType.User, id: "approver-1" }] }],
  requestSteps = [REQUEST_STEP] as (typeof REQUEST_STEP)[]
} = {}) => {
  let requestCounter = 0;
  const hasRole = vi.fn().mockReturnValue(false);
  const deps = {
    approvalRequestDAL: {
      findById: vi.fn().mockResolvedValue(APPROVAL_REQUEST),
      findByIdForUpdate: vi.fn().mockResolvedValue(APPROVAL_REQUEST),
      findStepsByRequestId: vi.fn().mockResolvedValue(requestSteps),
      findStepsByRequestIds: vi.fn().mockResolvedValue({ "request-1": requestSteps }),
      updateById: vi.fn((id: string, row: Record<string, unknown>) =>
        Promise.resolve({ ...APPROVAL_REQUEST, id, ...row, updatedAt: new Date("2026-03-01") })
      ),
      create: vi.fn((row: Record<string, unknown>) => {
        requestCounter += 1;
        return Promise.resolve({
          id: `request-${requestCounter}`,
          createdAt: new Date("2026-01-01"),
          updatedAt: new Date("2026-01-01"),
          ...row
        });
      }),
      transaction: vi.fn((cb: (tx: Knex) => Promise<unknown>) => cb(OWN_TX))
    },
    approvalRequestStepsDAL: {
      create: vi.fn((row: Record<string, unknown>) => Promise.resolve({ id: "step-1", ...row }))
    },
    approvalRequestStepEligibleApproversDAL: {
      create: vi.fn((row: Record<string, unknown>) => Promise.resolve({ id: "eligible-1", ...row }))
    },
    approvalRequestApprovalsDAL: {
      findOne: vi.fn().mockResolvedValue(null),
      create: vi.fn((row: Record<string, unknown>) =>
        Promise.resolve({ id: "approval-1", createdAt: REVIEW_CREATED_AT, ...row })
      ),
      updateById: vi.fn((id: string, row: Record<string, unknown>) =>
        Promise.resolve({ id, stepId: "step-1", approverUserId: "approver-1", createdAt: REVIEW_CREATED_AT, ...row })
      )
    },
    approvalPolicyDAL: {
      findStepsByPolicyId: vi.fn().mockResolvedValue(steps),
      findBypassersByPolicyIds: vi.fn().mockResolvedValue({})
    },
    secretChangeRequestDAL: {
      create: vi.fn((row: Record<string, unknown>) =>
        Promise.resolve({ id: "change-1", conflicts: null, bypassReason: null, statusChangedByUserId: null, ...row })
      ),
      findOne: vi.fn().mockResolvedValue(SECRET_CHANGE_REQUEST),
      findByProjectId: vi.fn().mockResolvedValue({ rows: [], totalCount: 0 }),
      countByProjectId: vi.fn().mockResolvedValue({ open: 2, closed: 1 }),
      updateById: vi.fn((id: string, row: Record<string, unknown>) =>
        Promise.resolve({
          ...SECRET_CHANGE_REQUEST,
          id,
          ...row,
          conflicts: typeof row.conflicts === "string" ? (JSON.parse(row.conflicts) as unknown) : row.conflicts
        })
      )
    },
    permissionService: {
      getProjectPermission: vi.fn().mockResolvedValue({ hasRole, permission: { can: vi.fn().mockReturnValue(false) } })
    },
    membershipUserDAL: {
      find: vi.fn().mockResolvedValue([{ actorUserId: "approver-1", isActive: true }])
    },
    userDAL: {
      find: vi.fn().mockResolvedValue([
        { id: "approver-1", email: "approver@example.com", username: "approver", firstName: "App", lastName: "Rover" },
        { id: "user-1", email: "alice@example.com", username: "alice", firstName: "Alice", lastName: "Smith" }
      ])
    },
    licenseService: { getPlan: vi.fn().mockResolvedValue({ secretApproval: true }) },
    userGroupMembershipDAL: {
      findGroupMembershipsByUserIdInOrg: vi.fn().mockResolvedValue([]),
      find: vi.fn().mockResolvedValue([])
    },
    kmsService: { createCipherPairWithDataKey: vi.fn().mockResolvedValue(CIPHER) },
    secretV2BridgeDAL: { invalidateSecretCacheByProjectId: vi.fn().mockResolvedValue(undefined) },
    projectDAL: { findById: vi.fn().mockResolvedValue(PROJECT) },
    folderDAL: {
      findSecretPathByFolderIds: vi
        .fn()
        .mockResolvedValue([{ environmentSlug: "dev", environmentName: "Development", path: "/app" }])
    },
    secretApprovalRequestSecretDAL: {
      insertV2Bridge: vi.fn<(rows: Record<string, unknown>[], tx?: Knex) => Promise<Record<string, unknown>[]>>(
        (rows) => Promise.resolve(rows.map((row, index) => ({ id: `commit-${index}`, ...row })))
      ),
      insertApprovalSecretV2Tags: vi.fn().mockResolvedValue([]),
      findBySecretChangeIdBridgeSecretV2: vi.fn().mockResolvedValue(COMMIT_ROWS),
      findCommitsBySecretChangeIds: vi.fn().mockResolvedValue([])
    },
    secretChangePolicyBridgeService: { findSecretChangePolicyById: vi.fn().mockResolvedValue(policy) }
  };
  const service = secretChangeRequestBridgeServiceFactory(
    deps as unknown as Parameters<typeof secretChangeRequestBridgeServiceFactory>[0]
  );
  return { service, deps, hasRole };
};

const dto = (overrides: Record<string, unknown> = {}) => ({
  actor: ActorType.USER,
  actorId: "user-1",
  actorOrgId: "org-1",
  actorAuthMethod: null,
  projectId: "project-1",
  environment: "dev",
  secretPath: "/",
  commitMessage: "msg",
  policy: { id: "policy-1" },
  data: { [SecretOperations.Create]: [{ secretKey: "NEW_KEY", secretValue: "v" }] },
  ...overrides
});

type TGenerateInput = Parameters<ReturnType<typeof buildService>["service"]["generateSecretChangeRequest"]>[0];
const generate = (service: ReturnType<typeof buildService>["service"], overrides: Record<string, unknown> = {}) =>
  service.generateSecretChangeRequest(dto(overrides) as unknown as TGenerateInput);

describe("secretChangeRequestBridge generateSecretChangeRequest", () => {
  beforeEach(() => {
    buildSecretApprovalCommits.mockReset().mockResolvedValue(BUNDLE);
    resolveRequester.mockReset().mockResolvedValue(REQUESTER);
    runSecretChangeRequestSideEffects.mockClear();
  });

  test("writes the request envelope, steps, change row and commits in its own transaction", async () => {
    const { service, deps } = buildService();

    const result = await generate(service);

    expect(buildSecretApprovalCommits).toHaveBeenCalledWith(expect.objectContaining({ policy: { id: "policy-1" } }));
    expect(deps.approvalRequestDAL.transaction).toHaveBeenCalledTimes(1);
    expect(deps.secretChangePolicyBridgeService.findSecretChangePolicyById).toHaveBeenCalledWith("policy-1", OWN_TX);
    expect(deps.approvalPolicyDAL.findStepsByPolicyId).toHaveBeenCalledWith("policy-1", OWN_TX);
    expect(resolveRequester).toHaveBeenCalledWith(ActorType.USER, "user-1", OWN_TX);

    expect(deps.approvalRequestDAL.create).toHaveBeenCalledWith(
      {
        projectId: "project-1",
        organizationId: "org-1",
        policyId: "policy-1",
        requesterId: "user-1",
        machineIdentityId: null,
        requesterName: "Alice Smith",
        requesterEmail: "alice@example.com",
        type: ApprovalPolicyType.SecretChange,
        status: ApprovalRequestStatus.Open,
        justification: undefined,
        currentStep: 1,
        requestData: { version: 1, requestData: {} },
        expiresAt: undefined,
        scopeType: null,
        scopeId: null
      },
      OWN_TX
    );
    expect(deps.approvalRequestStepsDAL.create).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: "request-1", stepNumber: 1, requiredApprovals: 1 }),
      OWN_TX
    );
    expect(deps.approvalRequestStepEligibleApproversDAL.create).toHaveBeenCalledWith(
      { stepId: "step-1", userId: "approver-1", groupId: null },
      OWN_TX
    );

    expect(deps.secretChangeRequestDAL.create).toHaveBeenCalledWith(
      {
        approvalRequestId: "request-1",
        folderId: "folder-1",
        slug: expect.any(String) as string,
        hasMerged: false,
        commitMessage: "msg"
      },
      OWN_TX
    );

    const [commitRows, commitTx] = deps.secretApprovalRequestSecretDAL.insertV2Bridge.mock.calls[0];
    expect(commitTx).toBe(OWN_TX);
    expect(commitRows).toEqual([
      expect.objectContaining({ op: SecretOperations.Create, key: "NEW_KEY", secretChangeId: "change-1" }),
      expect.objectContaining({
        op: SecretOperations.Delete,
        key: "OLD_KEY",
        secretId: "secret-2",
        secretChangeId: "change-1"
      })
    ]);
    commitRows.forEach((row: Record<string, unknown>) => {
      expect(row).not.toHaveProperty("requestId");
      expect(row).not.toHaveProperty("type");
    });

    expect(deps.secretApprovalRequestSecretDAL.insertApprovalSecretV2Tags).toHaveBeenCalledWith(
      [
        { secretId: "commit-0", tagId: "tag-1" },
        { secretId: "commit-0", tagId: "tag-2" }
      ],
      OWN_TX
    );

    expect(result).toMatchObject({
      id: "request-1",
      policyId: "policy-1",
      status: RequestState.Open,
      slug: expect.any(String) as string,
      folderId: "folder-1",
      hasMerged: false,
      committerUserId: "user-1",
      committerIdentityId: null,
      commitMessage: "msg",
      commits: [expect.objectContaining({ id: "commit-0" }), expect.objectContaining({ id: "commit-1" })]
    });

    expect(runSecretChangeRequestSideEffects).toHaveBeenCalledWith(
      expect.objectContaining({
        approvalRequest: expect.objectContaining({ id: "request-1" }) as object,
        secretChangeRequest: expect.objectContaining({ id: "change-1" }) as object,
        policy: POLICY,
        project: PROJECT,
        environment: "dev",
        secretPath: "/",
        secretKeys: ["NEW_KEY", "OLD_KEY"],
        tx: undefined
      })
    );
  });

  test("joins the caller's transaction and passes it to post-processing", async () => {
    const { service, deps } = buildService();

    await generate(service, { trx: CALLER_TX });

    expect(deps.approvalRequestDAL.transaction).not.toHaveBeenCalled();
    expect(deps.approvalRequestDAL.create).toHaveBeenCalledWith(expect.anything(), CALLER_TX);
    expect(deps.secretChangeRequestDAL.create).toHaveBeenCalledWith(expect.anything(), CALLER_TX);
    expect(deps.secretApprovalRequestSecretDAL.insertV2Bridge).toHaveBeenCalledWith(expect.anything(), CALLER_TX);
    expect(deps.secretApprovalRequestSecretDAL.insertApprovalSecretV2Tags).toHaveBeenCalledWith(
      expect.anything(),
      CALLER_TX
    );
    expect(runSecretChangeRequestSideEffects).toHaveBeenCalledWith(expect.objectContaining({ tx: CALLER_TX }));
  });

  test("skips post-processing when asked and skips the tag insert when there are no tags", async () => {
    buildSecretApprovalCommits.mockResolvedValue({ ...BUNDLE, commitTagIds: {}, tagIds: [] });
    const { service, deps } = buildService();

    await generate(service, { skipPostProcessing: true });

    expect(deps.secretApprovalRequestSecretDAL.insertApprovalSecretV2Tags).not.toHaveBeenCalled();
    expect(runSecretChangeRequestSideEffects).not.toHaveBeenCalled();
  });

  test("writes nothing when the policy no longer exists on the global approval system", async () => {
    const { service, deps } = buildService({ policy: null });

    await expect(generate(service)).rejects.toBeInstanceOf(NotFoundError);
    expect(deps.approvalRequestDAL.create).not.toHaveBeenCalled();
    expect(deps.secretChangeRequestDAL.create).not.toHaveBeenCalled();
    expect(runSecretChangeRequestSideEffects).not.toHaveBeenCalled();
  });

  test("refuses a policy without an approval step", async () => {
    const { service, deps } = buildService({ steps: [] });

    const result = generate(service);
    await expect(result).rejects.toBeInstanceOf(BadRequestError);
    await expect(result).rejects.toThrow("has no approval step configured");
    expect(deps.approvalRequestDAL.create).not.toHaveBeenCalled();
  });

  test("stores a machine identity requester on machineIdentityId", async () => {
    resolveRequester.mockResolvedValue({
      requesterUserId: null,
      machineIdentityId: "identity-1",
      requesterName: "ci-bot",
      requesterEmail: ""
    });
    const { service, deps } = buildService();

    const result = await generate(service, { actor: ActorType.IDENTITY, actorId: "identity-1" });

    expect(deps.approvalRequestDAL.create).toHaveBeenCalledWith(
      expect.objectContaining({ requesterId: null, machineIdentityId: "identity-1", requesterName: "ci-bot" }),
      OWN_TX
    );
    expect(result).toMatchObject({ committerUserId: null, committerIdentityId: "identity-1" });
  });
});

describe("secretChangeRequestBridge reviewSecretChangeRequest", () => {
  beforeEach(() => {
    queueChangeRequestWebhook.mockClear();
  });

  const review = (service: ReturnType<typeof buildService>["service"], overrides: Record<string, unknown> = {}) =>
    service.reviewSecretChangeRequest({
      approvalId: "request-1",
      actor: ActorType.USER,
      actorId: "approver-1",
      actorOrgId: "org-1",
      actorAuthMethod: null,
      status: ApprovalStatus.APPROVED,
      comment: "ship it",
      ...overrides
    } as Parameters<ReturnType<typeof buildService>["service"]["reviewSecretChangeRequest"]>[0]);

  test("records an approver's decision on the current step under the request lock and queues the webhook", async () => {
    const { service, deps } = buildService();

    const result = await review(service);

    expect(deps.licenseService.getPlan).toHaveBeenCalledWith("org-1");
    expect(deps.permissionService.getProjectPermission).toHaveBeenCalledWith(
      expect.objectContaining({ actor: ActorType.USER, actorId: "approver-1", projectId: "project-1" })
    );
    expect(deps.approvalRequestDAL.transaction).toHaveBeenCalledTimes(1);
    expect(deps.approvalRequestDAL.findByIdForUpdate).toHaveBeenCalledWith("request-1", OWN_TX);
    expect(deps.approvalRequestApprovalsDAL.findOne).toHaveBeenCalledWith(
      { stepId: "step-1", approverUserId: "approver-1" },
      OWN_TX
    );
    expect(deps.approvalRequestApprovalsDAL.create).toHaveBeenCalledWith(
      {
        stepId: "step-1",
        approverUserId: "approver-1",
        decision: ApprovalRequestApprovalDecision.Approved,
        comment: "ship it"
      },
      OWN_TX
    );

    expect(queueChangeRequestWebhook).toHaveBeenCalledWith({
      action: ChangeRequestWebhookAction.Reviewed,
      approvalRequest: APPROVAL_REQUEST,
      secretChangeRequest: SECRET_CHANGE_REQUEST,
      policy: POLICY,
      project: PROJECT,
      environment: "dev",
      environmentName: "Development",
      secretPath: "/app"
    });

    expect(result).toEqual({
      id: "approval-1",
      status: ApprovalStatus.APPROVED,
      requestId: "request-1",
      reviewerUserId: "approver-1",
      comment: "ship it",
      createdAt: REVIEW_CREATED_AT,
      updatedAt: REVIEW_CREATED_AT,
      projectId: "project-1"
    });
  });

  test("updates the reviewer's existing decision instead of adding a second row", async () => {
    const { service, deps } = buildService();
    deps.approvalRequestApprovalsDAL.findOne.mockResolvedValue({ id: "approval-9" });

    const result = await review(service, { status: ApprovalStatus.REJECTED, comment: undefined });

    expect(deps.approvalRequestApprovalsDAL.create).not.toHaveBeenCalled();
    expect(deps.approvalRequestApprovalsDAL.updateById).toHaveBeenCalledWith(
      "approval-9",
      { decision: ApprovalRequestApprovalDecision.Rejected, comment: null },
      OWN_TX
    );
    expect(result).toMatchObject({ id: "approval-9", status: ApprovalStatus.REJECTED, comment: null });
  });

  test("lets a project admin, the committer and a group member review", async () => {
    const { service, deps, hasRole } = buildService();

    hasRole.mockReturnValueOnce(true);
    await expect(review(service, { actorId: "outsider" })).resolves.toMatchObject({ reviewerUserId: "outsider" });
    expect(hasRole).toHaveBeenCalledWith(ProjectMembershipRole.Admin);

    await expect(review(service, { actorId: "user-1" })).resolves.toMatchObject({ reviewerUserId: "user-1" });

    deps.userGroupMembershipDAL.findGroupMembershipsByUserIdInOrg.mockResolvedValueOnce([{ groupId: "group-1" }]);
    await expect(review(service, { actorId: "member-1" })).resolves.toMatchObject({ reviewerUserId: "member-1" });
    expect(deps.userGroupMembershipDAL.findGroupMembershipsByUserIdInOrg).toHaveBeenCalledWith("member-1", "org-1");
  });

  test("forbids a user who is neither admin, committer nor an eligible approver", async () => {
    const { service, deps } = buildService();

    await expect(review(service, { actorId: "outsider" })).rejects.toBeInstanceOf(ForbiddenRequestError);
    expect(deps.approvalRequestDAL.transaction).not.toHaveBeenCalled();
    expect(queueChangeRequestWebhook).not.toHaveBeenCalled();
  });

  test("refuses when the plan lacks secret approvals", async () => {
    const { service, deps } = buildService();
    deps.licenseService.getPlan.mockResolvedValue({ secretApproval: false });

    const result = review(service);
    await expect(result).rejects.toBeInstanceOf(BadRequestError);
    await expect(result).rejects.toThrow("plan restriction");
    expect(deps.approvalRequestDAL.findById).not.toHaveBeenCalled();
  });

  test("reads an unknown id or a request of another type as not found", async () => {
    const { service, deps } = buildService();

    deps.approvalRequestDAL.findById.mockResolvedValueOnce(null);
    await expect(review(service)).rejects.toBeInstanceOf(NotFoundError);

    deps.approvalRequestDAL.findById.mockResolvedValueOnce({ ...APPROVAL_REQUEST, type: ApprovalPolicyType.PamAccess });
    await expect(review(service)).rejects.toBeInstanceOf(NotFoundError);

    deps.secretChangeRequestDAL.findOne.mockResolvedValueOnce(null);
    await expect(review(service)).rejects.toBeInstanceOf(NotFoundError);
  });

  test("refuses a non-user actor and a request that is not open", async () => {
    const { service, deps } = buildService();

    await expect(review(service, { actor: ActorType.IDENTITY })).rejects.toThrow("Must be a user");

    deps.approvalRequestDAL.findById.mockResolvedValueOnce({
      ...APPROVAL_REQUEST,
      status: ApprovalRequestStatus.Closed
    });
    await expect(review(service)).rejects.toThrow("You can only review open approval requests");

    deps.approvalRequestDAL.findByIdForUpdate.mockResolvedValueOnce({
      ...APPROVAL_REQUEST,
      status: ApprovalRequestStatus.Closed
    });
    await expect(review(service)).rejects.toThrow("You can only review open approval requests");
    expect(deps.approvalRequestApprovalsDAL.create).not.toHaveBeenCalled();
  });

  test("refuses a request whose policy is gone", async () => {
    const { service, deps } = buildService();

    deps.approvalRequestDAL.findById.mockResolvedValueOnce({ ...APPROVAL_REQUEST, policyId: null });
    await expect(review(service)).rejects.toThrow("has been deleted");
    expect(deps.secretChangePolicyBridgeService.findSecretChangePolicyById).not.toHaveBeenCalled();

    deps.secretChangePolicyBridgeService.findSecretChangePolicyById.mockResolvedValueOnce(undefined);
    await expect(review(service)).rejects.toThrow("has been deleted");
  });

  test("refuses a self review when the policy disallows it", async () => {
    const { service } = buildService({ policy: { ...POLICY, allowedSelfApprovals: false } });

    await expect(review(service, { actorId: "user-1" })).rejects.toThrow("review their own request");
  });

  test("refuses a request without a current step", async () => {
    const { service, deps } = buildService();
    deps.approvalRequestDAL.findStepsByRequestId.mockResolvedValueOnce([]);

    await expect(review(service)).rejects.toThrow("has no approval step to review");
  });

  test("keeps the review when the webhook cannot be queued or the folder is gone", async () => {
    const { service, deps } = buildService();

    queueChangeRequestWebhook.mockRejectedValueOnce(new Error("redis down"));
    await expect(review(service)).resolves.toMatchObject({ reviewerUserId: "approver-1" });

    deps.folderDAL.findSecretPathByFolderIds.mockResolvedValueOnce([]);
    await expect(review(service)).resolves.toMatchObject({ reviewerUserId: "approver-1" });
    expect(queueChangeRequestWebhook).toHaveBeenCalledTimes(1);
  });
});

describe("secretChangeRequestBridge mergeSecretChangeRequest", () => {
  const approvedBy = (...userIds: string[]) =>
    userIds.map((approverUserId, index) => ({
      id: `approval-${index}`,
      stepId: "step-1",
      approverUserId,
      decision: ApprovalRequestApprovalDecision.Approved
    }));
  const stepWith = (overrides: Partial<typeof REQUEST_STEP>) => ({ ...REQUEST_STEP, ...overrides });

  beforeEach(() => {
    queueChangeRequestWebhook.mockClear();
    syncMergedSecrets.mockClear();
    notifySecretApprovalBypass.mockClear();
    detectSecretApprovalCommitConflicts
      .mockReset()
      .mockResolvedValue({ conflicts: [], creates: COMMIT_ROWS, updates: [], deletes: [] });
    applySecretApprovalCommitsV2Bridge.mockReset().mockResolvedValue(APPLIED_SECRETS);
    findMergedFolder.mockReset().mockResolvedValue(MERGED_FOLDER);
  });

  const merge = (service: ReturnType<typeof buildService>["service"], overrides: Record<string, unknown> = {}) =>
    service.mergeSecretChangeRequest({
      approvalId: "request-1",
      actor: ActorType.USER,
      actorId: "approver-1",
      actorOrgId: "org-1",
      actorAuthMethod: null,
      ...overrides
    } as Parameters<ReturnType<typeof buildService>["service"]["mergeSecretChangeRequest"]>[0]);

  test("applies the commits under the request lock, closes the request and reports the merge", async () => {
    const { service, deps } = buildService({ requestSteps: [stepWith({ approvals: approvedBy("approver-1") })] });

    const result = await merge(service);

    expect(deps.approvalRequestDAL.findByIdForUpdate).toHaveBeenCalledWith("request-1", OWN_TX);
    expect(detectSecretApprovalCommitConflicts).toHaveBeenCalledWith({ folderId: "folder-1", commits: COMMIT_ROWS });
    expect(deps.kmsService.createCipherPairWithDataKey).toHaveBeenCalledTimes(1);
    expect(applySecretApprovalCommitsV2Bridge).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-1",
        folderId: "folder-1",
        environment: "dev",
        envId: "env-1",
        secretPath: "/app",
        actor: ActorType.USER,
        actorId: "approver-1",
        actorOrgId: "org-1",
        cipher: CIPHER,
        blindIndexer: BLIND_INDEXER,
        creates: COMMIT_ROWS,
        updates: [],
        deletes: [],
        tx: OWN_TX
      })
    );
    expect(deps.secretChangeRequestDAL.updateById).toHaveBeenCalledWith(
      "change-1",
      { conflicts: "[]", hasMerged: true, statusChangedByUserId: "approver-1", bypassReason: null },
      OWN_TX
    );
    expect(deps.approvalRequestDAL.updateById).toHaveBeenCalledWith(
      "request-1",
      { status: ApprovalRequestStatus.Closed },
      OWN_TX
    );
    expect(deps.secretV2BridgeDAL.invalidateSecretCacheByProjectId).toHaveBeenCalledWith("project-1", OWN_TX);

    expect(syncMergedSecrets).toHaveBeenCalledWith({
      projectId: "project-1",
      actorOrgId: "org-1",
      actor: ActorType.USER,
      actorId: "approver-1",
      folder: MERGED_FOLDER,
      secrets: APPLIED_SECRETS
    });
    expect(queueChangeRequestWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        action: ChangeRequestWebhookAction.Merged,
        approvalRequest: expect.objectContaining({ status: ApprovalRequestStatus.Closed }) as unknown,
        secretChangeRequest: expect.objectContaining({ hasMerged: true }) as unknown,
        environment: "dev",
        secretPath: "/app",
        isBypassed: false
      })
    );
    expect(notifySecretApprovalBypass).not.toHaveBeenCalled();

    expect(result).toMatchObject({
      projectId: "project-1",
      isMergedViaBypass: false,
      secrets: APPLIED_SECRETS,
      approval: {
        id: "request-1",
        slug: "slug-1",
        status: ApprovalRequestStatus.Closed,
        hasMerged: true,
        conflicts: [],
        statusChangedByUserId: "approver-1",
        committerUserId: "user-1",
        commits: [{ id: "commit-1", key: "NEW_KEY", secretVersion: null }]
      },
      secretMutationEvents: [
        {
          type: EventType.CREATE_SECRET,
          metadata: { environment: "dev", secretPath: "/app", secretId: "secret-1", secretKey: "NEW_KEY" }
        }
      ],
      requestedByActor: { type: ActorType.USER, metadata: { userId: "user-1" } }
    });
  });

  test("counts an approval from a member of an approver group", async () => {
    const { service, deps } = buildService({
      requestSteps: [
        stepWith({ approvers: [{ type: ApproverType.Group, id: "group-1" }], approvals: approvedBy("member-1") })
      ]
    });
    deps.userGroupMembershipDAL.find.mockResolvedValue([{ userId: "member-1" }]);
    deps.userGroupMembershipDAL.findGroupMembershipsByUserIdInOrg.mockResolvedValue([{ groupId: "group-1" }]);

    await expect(merge(service, { actorId: "member-1" })).resolves.toMatchObject({ isMergedViaBypass: false });
    expect(deps.userGroupMembershipDAL.find).toHaveBeenCalledWith({ groupId: "group-1" });
  });

  test("ignores an approval from someone who is not an approver on the step", async () => {
    const { service, hasRole } = buildService({ requestSteps: [stepWith({ approvals: approvedBy("admin-1") })] });
    hasRole.mockReturnValue(true);

    await expect(merge(service, { actorId: "admin-1" })).rejects.toThrow(
      new BadRequestError({ message: "Secret approval request 'slug-1' needs 1 approval(s) on step 1 and has 0." })
    );
    expect(applySecretApprovalCommitsV2Bridge).not.toHaveBeenCalled();
  });

  test("requires every step to be approved, not only the current one", async () => {
    const { service } = buildService({
      requestSteps: [
        stepWith({ approvals: approvedBy("approver-1") }),
        stepWith({
          id: "step-2",
          stepNumber: 2,
          requiredApprovals: 2,
          approvers: [{ type: ApproverType.User, id: "approver-2" }],
          approvals: []
        })
      ]
    });

    await expect(merge(service)).rejects.toThrow(
      new BadRequestError({ message: "Secret approval request 'slug-1' needs 2 approval(s) on step 2 and has 0." })
    );
  });

  test("lets a soft policy without bypassers merge unapproved and records the bypass", async () => {
    const { service, deps } = buildService({ policy: { ...POLICY, enforcementLevel: "soft" } });

    const result = await merge(service, { actorId: "user-1", bypassReason: "incident" });

    expect(deps.secretChangeRequestDAL.updateById).toHaveBeenCalledWith(
      "change-1",
      expect.objectContaining({ hasMerged: true, bypassReason: "incident" }),
      OWN_TX
    );
    expect(queueChangeRequestWebhook).toHaveBeenCalledWith(expect.objectContaining({ isBypassed: true }));
    expect(notifySecretApprovalBypass).toHaveBeenCalledWith({
      project: PROJECT,
      environmentName: "Development",
      secretPath: "/app",
      actorId: "user-1",
      approverUserIds: ["approver-1"],
      bypassReason: "incident"
    });
    expect(result).toMatchObject({ isMergedViaBypass: true, approval: { bypassReason: "incident" } });
  });

  test("only a listed bypasser, directly or through a group, can bypass a soft policy", async () => {
    const policy = { ...POLICY, enforcementLevel: "soft", bypassers: [{ type: "group", id: "group-9" }] };
    const refused = buildService({ policy });
    await expect(merge(refused.service, { actorId: "user-1" })).rejects.toBeInstanceOf(BadRequestError);

    const allowed = buildService({ policy });
    allowed.deps.userGroupMembershipDAL.findGroupMembershipsByUserIdInOrg.mockResolvedValue([{ groupId: "group-9" }]);
    await expect(merge(allowed.service, { actorId: "user-1" })).resolves.toMatchObject({ isMergedViaBypass: true });

    const direct = buildService({ policy: { ...policy, bypassers: [{ type: "user", id: "user-1" }] } });
    await expect(merge(direct.service, { actorId: "user-1" })).resolves.toMatchObject({ isMergedViaBypass: true });
  });

  test("does not persist a bypass reason on a fully approved merge", async () => {
    const { service, deps } = buildService({
      policy: { ...POLICY, enforcementLevel: "soft" },
      requestSteps: [stepWith({ approvals: approvedBy("approver-1") })]
    });

    await merge(service, { bypassReason: "not needed" });

    expect(deps.secretChangeRequestDAL.updateById).toHaveBeenCalledWith(
      "change-1",
      expect.objectContaining({ bypassReason: null }),
      OWN_TX
    );
    expect(notifySecretApprovalBypass).not.toHaveBeenCalled();
  });

  test("refuses when the plan lacks secret approvals", async () => {
    const { service, deps } = buildService();
    deps.licenseService.getPlan.mockResolvedValue({ secretApproval: false });

    await expect(merge(service)).rejects.toBeInstanceOf(BadRequestError);
    expect(deps.approvalRequestDAL.findById).not.toHaveBeenCalled();
  });

  test("refuses a non-user actor, a merged request and a request that is not open", async () => {
    const { service, deps } = buildService({ requestSteps: [stepWith({ approvals: approvedBy("approver-1") })] });

    await expect(merge(service, { actor: ActorType.IDENTITY })).rejects.toThrow(
      new BadRequestError({ message: "Must be a user" })
    );

    deps.secretChangeRequestDAL.findOne.mockResolvedValueOnce({ ...SECRET_CHANGE_REQUEST, hasMerged: true });
    await expect(merge(service)).rejects.toThrow(
      new BadRequestError({ message: "This secret approval request has already been merged." })
    );

    deps.approvalRequestDAL.findById.mockResolvedValueOnce({
      ...APPROVAL_REQUEST,
      status: ApprovalRequestStatus.Closed
    });
    await expect(merge(service)).rejects.toThrow(
      new BadRequestError({ message: "You can only merge open approval requests" })
    );
    expect(applySecretApprovalCommitsV2Bridge).not.toHaveBeenCalled();
  });

  test("refuses when the request was closed between the checks and the lock", async () => {
    const { service, deps } = buildService({ requestSteps: [stepWith({ approvals: approvedBy("approver-1") })] });
    deps.approvalRequestDAL.findByIdForUpdate.mockResolvedValueOnce({
      ...APPROVAL_REQUEST,
      status: ApprovalRequestStatus.Closed
    });

    await expect(merge(service)).rejects.toBeInstanceOf(BadRequestError);
    expect(applySecretApprovalCommitsV2Bridge).not.toHaveBeenCalled();
    expect(deps.secretChangeRequestDAL.updateById).not.toHaveBeenCalled();
  });

  test("reads an unknown id or a request of another type as not found", async () => {
    const { service, deps } = buildService();
    deps.approvalRequestDAL.findById.mockResolvedValueOnce(null);
    await expect(merge(service)).rejects.toBeInstanceOf(NotFoundError);

    deps.approvalRequestDAL.findById.mockResolvedValueOnce({ ...APPROVAL_REQUEST, type: ApprovalPolicyType.PamAccess });
    await expect(merge(service)).rejects.toBeInstanceOf(NotFoundError);
  });

  test("refuses a request whose policy is gone", async () => {
    const { service } = buildService({ policy: null });
    await expect(merge(service)).rejects.toThrow(
      new BadRequestError({ message: "The policy associated with this secret approval request has been deleted." })
    );
  });

  test("forbids a user who is neither admin, requester nor an eligible approver", async () => {
    const { service } = buildService({ requestSteps: [stepWith({ approvals: approvedBy("approver-1") })] });
    await expect(merge(service, { actorId: "stranger-1" })).rejects.toBeInstanceOf(ForbiddenRequestError);
  });

  test("lets the requester merge once the approvers have approved", async () => {
    const { service } = buildService({ requestSteps: [stepWith({ approvals: approvedBy("approver-1") })] });
    await expect(merge(service, { actorId: "user-1" })).resolves.toMatchObject({ isMergedViaBypass: false });
  });

  test("keeps the merge when the webhook cannot be queued", async () => {
    const { service } = buildService({ requestSteps: [stepWith({ approvals: approvedBy("approver-1") })] });
    queueChangeRequestWebhook.mockRejectedValueOnce(new Error("redis down"));

    await expect(merge(service)).resolves.toMatchObject({ approval: { hasMerged: true } });
    expect(syncMergedSecrets).toHaveBeenCalledTimes(1);
  });
});

describe("secretChangeRequestBridge updateSecretChangeRequestStatus", () => {
  beforeEach(() => {
    queueChangeRequestWebhook.mockClear();
  });

  const setStatus = (service: ReturnType<typeof buildService>["service"], overrides: Record<string, unknown> = {}) =>
    service.updateSecretChangeRequestStatus({
      approvalId: "request-1",
      actor: ActorType.USER,
      actorId: "approver-1",
      actorOrgId: "org-1",
      actorAuthMethod: null,
      status: RequestState.Closed,
      ...overrides
    } as Parameters<ReturnType<typeof buildService>["service"]["updateSecretChangeRequestStatus"]>[0]);

  test("closes an open request on both tables under the request lock and queues the webhook", async () => {
    const { service, deps } = buildService();

    const result = await setStatus(service);

    expect(deps.licenseService.getPlan).toHaveBeenCalledWith("org-1");
    expect(deps.approvalRequestDAL.findByIdForUpdate).toHaveBeenCalledWith("request-1", OWN_TX);
    expect(deps.secretChangeRequestDAL.findOne).toHaveBeenCalledWith({ approvalRequestId: "request-1" }, OWN_TX);
    expect(deps.approvalRequestDAL.updateById).toHaveBeenCalledWith(
      "request-1",
      { status: ApprovalRequestStatus.Closed },
      OWN_TX
    );
    expect(deps.secretChangeRequestDAL.updateById).toHaveBeenCalledWith(
      "change-1",
      { statusChangedByUserId: "approver-1" },
      OWN_TX
    );
    expect(queueChangeRequestWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        action: ChangeRequestWebhookAction.Closed,
        approvalRequest: expect.objectContaining({ status: ApprovalRequestStatus.Closed }) as unknown,
        secretChangeRequest: expect.objectContaining({ statusChangedByUserId: "approver-1" }) as unknown,
        environment: "dev",
        environmentName: "Development",
        secretPath: "/app"
      })
    );
    expect(result).toMatchObject({
      id: "request-1",
      status: ApprovalRequestStatus.Closed,
      statusChangedByUserId: "approver-1",
      slug: "slug-1",
      hasMerged: false,
      projectId: "project-1"
    });
    expect(result).not.toHaveProperty("commits");
  });

  test("reopens a closed request", async () => {
    const { service, deps } = buildService();
    const closed = { ...APPROVAL_REQUEST, status: ApprovalRequestStatus.Closed };
    deps.approvalRequestDAL.findById.mockResolvedValue(closed);
    deps.approvalRequestDAL.findByIdForUpdate.mockResolvedValue(closed);

    await expect(setStatus(service, { status: RequestState.Open })).resolves.toMatchObject({
      status: ApprovalRequestStatus.Open
    });
    expect(queueChangeRequestWebhook).toHaveBeenCalledWith(
      expect.objectContaining({ action: ChangeRequestWebhookAction.Reopened })
    );
  });

  test("refuses when the plan lacks secret approvals", async () => {
    const { service, deps } = buildService();
    deps.licenseService.getPlan.mockResolvedValue({ secretApproval: false });

    await expect(setStatus(service)).rejects.toThrow("plan restriction");
    expect(deps.approvalRequestDAL.findById).not.toHaveBeenCalled();
  });

  test("reads an unknown id or a request of another type as not found", async () => {
    const { service, deps } = buildService();

    deps.approvalRequestDAL.findById.mockResolvedValueOnce(null);
    await expect(setStatus(service)).rejects.toBeInstanceOf(NotFoundError);

    deps.approvalRequestDAL.findById.mockResolvedValueOnce({ ...APPROVAL_REQUEST, type: ApprovalPolicyType.PamAccess });
    await expect(setStatus(service)).rejects.toBeInstanceOf(NotFoundError);
  });

  test("refuses a non-user actor and a request whose policy is gone", async () => {
    const { service, deps } = buildService();

    await expect(setStatus(service, { actor: ActorType.IDENTITY })).rejects.toThrow("Must be a user");

    deps.secretChangePolicyBridgeService.findSecretChangePolicyById.mockResolvedValueOnce(null);
    await expect(setStatus(service)).rejects.toThrow("has been deleted");
    expect(deps.approvalRequestDAL.transaction).not.toHaveBeenCalled();
  });

  test("lets a project admin, the requester and a group member change the status but not a stranger", async () => {
    const { service, deps, hasRole } = buildService();

    hasRole.mockReturnValueOnce(true);
    await expect(setStatus(service, { actorId: "outsider" })).resolves.toMatchObject({
      statusChangedByUserId: "outsider"
    });

    await expect(setStatus(service, { actorId: "user-1" })).resolves.toMatchObject({ statusChangedByUserId: "user-1" });

    deps.userGroupMembershipDAL.findGroupMembershipsByUserIdInOrg.mockResolvedValueOnce([{ groupId: "group-1" }]);
    await expect(setStatus(service, { actorId: "member-1" })).resolves.toMatchObject({
      statusChangedByUserId: "member-1"
    });

    await expect(setStatus(service, { actorId: "stranger" })).rejects.toBeInstanceOf(ForbiddenRequestError);
  });

  test("refuses a merged request and a request already in the requested status", async () => {
    const { service, deps } = buildService();

    deps.secretChangeRequestDAL.findOne.mockResolvedValueOnce({ ...SECRET_CHANGE_REQUEST, hasMerged: true });
    await expect(setStatus(service)).rejects.toThrow("Approval request has been merged");

    await expect(setStatus(service, { status: RequestState.Open })).rejects.toThrow("Approval request is already open");

    deps.approvalRequestDAL.findById.mockResolvedValueOnce({
      ...APPROVAL_REQUEST,
      status: ApprovalRequestStatus.Closed
    });
    await expect(setStatus(service)).rejects.toThrow("Approval request is already closed");
    expect(deps.approvalRequestDAL.updateById).not.toHaveBeenCalled();
  });

  test("gives up when the request changed between the checks and the lock", async () => {
    const { service, deps } = buildService();

    deps.approvalRequestDAL.findByIdForUpdate.mockResolvedValueOnce({
      ...APPROVAL_REQUEST,
      status: ApprovalRequestStatus.Closed
    });
    await expect(setStatus(service)).rejects.toThrow("Approval request is already closed");

    deps.secretChangeRequestDAL.findOne
      .mockResolvedValueOnce(SECRET_CHANGE_REQUEST)
      .mockResolvedValueOnce({ ...SECRET_CHANGE_REQUEST, hasMerged: true });
    await expect(setStatus(service)).rejects.toThrow("Approval request has been merged");
    expect(deps.approvalRequestDAL.updateById).not.toHaveBeenCalled();
    expect(queueChangeRequestWebhook).not.toHaveBeenCalled();
  });

  test("keeps the status change when the webhook cannot be queued or the folder is gone", async () => {
    const { service, deps } = buildService();

    queueChangeRequestWebhook.mockRejectedValueOnce(new Error("redis down"));
    await expect(setStatus(service)).resolves.toMatchObject({ status: ApprovalRequestStatus.Closed });

    deps.folderDAL.findSecretPathByFolderIds.mockResolvedValueOnce([]);
    await expect(setStatus(service)).resolves.toMatchObject({ status: ApprovalRequestStatus.Closed });
    expect(queueChangeRequestWebhook).toHaveBeenCalledTimes(1);
  });
});

describe("secretChangeRequestBridge getSecretChangeRequestById", () => {
  const DETAIL_COMMIT = {
    id: "commit-1",
    op: SecretOperations.Update,
    key: "NEW_KEY",
    version: 2,
    secretId: "secret-1",
    encryptedValue: Buffer.from("new"),
    encryptedComment: null,
    skipMultilineEncoding: null,
    secretMetadata: null,
    tags: [{ id: "tag-1", name: "t", slug: "t", color: "red" }],
    secret: {
      id: "secret-1",
      version: 1,
      key: "NEW_KEY",
      encryptedValue: Buffer.from("live"),
      encryptedComment: null,
      isRotatedSecret: false,
      rotationId: null
    },
    secretVersion: undefined,
    oldSecretMetadata: []
  };
  const reviewedStep = {
    ...REQUEST_STEP,
    approvals: [
      {
        id: "approval-1",
        stepId: "step-1",
        approverUserId: "approver-1",
        decision: ApprovalRequestApprovalDecision.Approved,
        comment: null,
        createdAt: REVIEW_CREATED_AT
      }
    ]
  };

  const details = (service: ReturnType<typeof buildService>["service"], overrides: Record<string, unknown> = {}) =>
    service.getSecretChangeRequestById({
      id: "request-1",
      actor: ActorType.USER,
      actorId: "approver-1",
      actorOrgId: "org-1",
      actorAuthMethod: null,
      ...overrides
    } as Parameters<ReturnType<typeof buildService>["service"]["getSecretChangeRequestById"]>[0]);

  const buildDetailsService = (overrides: Parameters<typeof buildService>[0] = {}) => {
    const built = buildService({ requestSteps: [reviewedStep], ...overrides });
    built.deps.secretApprovalRequestSecretDAL.findBySecretChangeIdBridgeSecretV2.mockResolvedValue([DETAIL_COMMIT]);
    built.deps.secretChangeRequestDAL.findOne.mockResolvedValue({
      ...SECRET_CHANGE_REQUEST,
      statusChangedByUserId: "user-1"
    });
    return built;
  };

  test("returns the request with its policy, people and decrypted commits for an eligible approver", async () => {
    const { service, deps } = buildDetailsService();

    const result = await details(service);

    expect(deps.licenseService.getPlan).not.toHaveBeenCalled();
    expect(deps.userGroupMembershipDAL.find).toHaveBeenCalledWith({ $in: { groupId: ["group-1"] } });
    expect(deps.membershipUserDAL.find).toHaveBeenCalledWith(
      expect.objectContaining({
        scopeOrgId: "org-1",
        $in: { actorUserId: expect.arrayContaining(["approver-1", "user-1"]) as string[] }
      })
    );
    expect(result).toMatchObject({
      id: "request-1",
      projectId: "project-1",
      environment: "dev",
      secretPath: "/app",
      slug: "slug-1",
      policy: {
        id: "policy-1",
        name: "dev-policy",
        enforcementLevel: "hard",
        allowedSelfApprovals: true,
        deletedAt: null,
        approvers: [{ userId: "approver-1", email: "approver@example.com", isOrgMembershipActive: true }],
        bypassers: []
      },
      statusChangedByUser: { userId: "user-1", username: "alice" },
      committerUser: { userId: "user-1", email: "alice@example.com", firstName: "Alice" },
      committerIdentity: null,
      reviewers: [
        {
          userId: "approver-1",
          status: ApprovalRequestApprovalDecision.Approved,
          comment: "",
          createdAt: REVIEW_CREATED_AT,
          isOrgMembershipActive: true
        }
      ],
      commits: [
        {
          id: "commit-1",
          secretKey: "NEW_KEY",
          op: SecretOperations.Update,
          secretValueHidden: false,
          secretValue: "plain:new",
          secret: { id: "secret-1", secretValue: "plain:live", secretValueHidden: false }
        }
      ]
    });
    expect(result.policy.approvers[0]).not.toHaveProperty("isOrgMembershipActive", null);
  });

  test("refuses a service token and reads an unknown id or a missing folder as not found", async () => {
    const { service, deps } = buildDetailsService();

    await expect(details(service, { actor: ActorType.SERVICE })).rejects.toThrow("Cannot use service token");

    deps.approvalRequestDAL.findById.mockResolvedValueOnce(null);
    await expect(details(service)).rejects.toBeInstanceOf(NotFoundError);

    deps.folderDAL.findSecretPathByFolderIds.mockResolvedValueOnce([]);
    await expect(details(service)).rejects.toBeInstanceOf(NotFoundError);
  });

  test("lets the read permission, an admin, the requester, the requesting identity or a group member in", async () => {
    const { service, deps, hasRole } = buildDetailsService();

    await expect(details(service, { actorId: "stranger" })).rejects.toBeInstanceOf(ForbiddenRequestError);

    deps.permissionService.getProjectPermission.mockResolvedValueOnce({
      hasRole,
      permission: { can: vi.fn().mockReturnValue(true) }
    });
    await expect(details(service, { actorId: "stranger" })).resolves.toMatchObject({ id: "request-1" });

    hasRole.mockReturnValueOnce(true);
    await expect(details(service, { actorId: "stranger" })).resolves.toMatchObject({ id: "request-1" });

    await expect(details(service, { actorId: "user-1" })).resolves.toMatchObject({ id: "request-1" });

    deps.approvalRequestDAL.findById.mockResolvedValueOnce({
      ...APPROVAL_REQUEST,
      requesterId: null,
      machineIdentityId: "identity-1",
      requesterName: "Deploy bot"
    });
    await expect(details(service, { actor: ActorType.IDENTITY, actorId: "identity-1" })).resolves.toMatchObject({
      committerUser: null,
      committerIdentity: { identityId: "identity-1", name: "Deploy bot" }
    });

    deps.userGroupMembershipDAL.find.mockResolvedValueOnce([{ groupId: "group-1", userId: "member-1" }]);
    await expect(details(service, { actorId: "member-1" })).resolves.toMatchObject({ id: "request-1" });
  });

  test("masks the values once the request is closed for an approver without read access", async () => {
    const { service, deps } = buildDetailsService();
    deps.approvalRequestDAL.findById.mockResolvedValueOnce({
      ...APPROVAL_REQUEST,
      status: ApprovalRequestStatus.Closed
    });

    const result = await details(service);

    expect(result.commits[0]).toMatchObject({
      secretValueHidden: true,
      secretValue: INFISICAL_SECRET_VALUE_HIDDEN_MASK
    });
  });

  test("still answers when the policy was deleted and when the requesting user is gone", async () => {
    const { service, deps } = buildDetailsService();
    deps.approvalRequestDAL.findById.mockResolvedValueOnce({
      ...APPROVAL_REQUEST,
      policyId: null,
      requesterId: "ghost-1",
      requesterEmail: "ghost@example.com",
      requesterName: "Ghost"
    });

    const result = await details(service);

    expect(deps.secretChangePolicyBridgeService.findSecretChangePolicyById).not.toHaveBeenCalled();
    expect(result.policyId).toBeNull();
    expect(result.policy).toMatchObject({
      id: "",
      approvals: 1,
      deletedAt: expect.any(Date) as Date,
      approvers: [{ userId: "approver-1" }]
    });
    expect(result.committerUser).toEqual({
      userId: "ghost-1",
      email: "ghost@example.com",
      username: "ghost@example.com",
      firstName: "Ghost",
      lastName: null
    });
  });
});

describe("secretChangeRequestBridge listSecretChangeRequests and countSecretChangeRequests", () => {
  const LIST_ROW = {
    ...APPROVAL_REQUEST,
    requesterName: "Alice Smith",
    requesterEmail: "alice@example.com",
    machineIdentityId: null,
    secretChangeId: "change-1",
    folderId: "folder-1",
    slug: "slug-1",
    hasMerged: false,
    conflicts: null,
    commitMessage: "msg",
    bypassReason: null,
    statusChangedByUserId: null,
    environment: "dev",
    environmentName: "Development",
    requestFolderPath: "app",
    policyName: "dev-policy",
    policyEnforcementLevel: "soft",
    policyConstraints: { constraints: { allowedSelfApprovals: false } },
    policySecretPath: "/app",
    policyApprovals: 2,
    committerUserEmail: "alice@example.com",
    committerUserUsername: "alice",
    committerUserFirstName: "Alice",
    committerUserLastName: "Smith",
    committerIdentityName: null
  };
  const filter = { projectId: "project-1", userId: "approver-1", limit: 20, offset: 0 };

  test("hydrates the page in batches and maps it onto the list shape", async () => {
    const { service, deps } = buildService({
      requestSteps: [
        {
          ...REQUEST_STEP,
          approvals: [
            {
              id: "approval-1",
              stepId: "step-1",
              approverUserId: "approver-1",
              decision: ApprovalRequestApprovalDecision.Approved
            }
          ]
        }
      ]
    });
    deps.secretChangeRequestDAL.findByProjectId.mockResolvedValue({ rows: [LIST_ROW], totalCount: 5 });
    deps.secretApprovalRequestSecretDAL.findCommitsBySecretChangeIds.mockResolvedValue([
      { id: "commit-1", op: "create", secretId: null, secretChangeId: "change-1" }
    ]);
    deps.approvalPolicyDAL.findBypassersByPolicyIds.mockResolvedValue({
      "policy-1": [{ type: ApproverType.Group, id: "group-2" }]
    });
    deps.userGroupMembershipDAL.find.mockResolvedValue([
      { groupId: "group-1", userId: "member-1" },
      { groupId: "group-1", userId: "approver-1" },
      { groupId: "group-2", userId: "bypasser-1" }
    ]);

    const result = await service.listSecretChangeRequests(filter);

    expect(deps.secretChangeRequestDAL.findByProjectId).toHaveBeenCalledWith(filter);
    expect(deps.approvalRequestDAL.findStepsByRequestIds).toHaveBeenCalledWith(["request-1"]);
    expect(deps.secretApprovalRequestSecretDAL.findCommitsBySecretChangeIds).toHaveBeenCalledWith(["change-1"]);
    expect(deps.approvalPolicyDAL.findBypassersByPolicyIds).toHaveBeenCalledWith(["policy-1"]);
    expect(deps.userGroupMembershipDAL.find).toHaveBeenCalledWith({
      $in: { groupId: expect.arrayContaining(["group-1", "group-2"]) as string[] }
    });
    expect(result.totalCount).toBe(5);
    expect(result.approvals).toHaveLength(1);
    expect(result.approvals[0]).toMatchObject({
      id: "request-1",
      projectId: "project-1",
      environment: "dev",
      environmentName: "Development",
      status: ApprovalRequestStatus.Open,
      slug: "slug-1",
      commitMessage: "msg",
      committerUserId: "user-1",
      policy: {
        id: "policy-1",
        name: "dev-policy",
        approvals: 2,
        secretPath: "/app",
        enforcementLevel: "soft",
        allowedSelfApprovals: false,
        deletedAt: null,
        approvers: [{ userId: "approver-1" }, { userId: "member-1" }],
        bypassers: [{ userId: "bypasser-1" }]
      },
      committerUser: { userId: "user-1", email: "alice@example.com", username: "alice", firstName: "Alice" },
      committerIdentity: null,
      reviewers: [{ userId: "approver-1", status: ApprovalRequestApprovalDecision.Approved }],
      commits: [{ op: "create", secretId: null }],
      approvers: [{ userId: "approver-1" }, { userId: "member-1" }],
      bypassers: [{ userId: "bypasser-1" }]
    });
  });

  test("marks a request whose policy is gone and skips the follow-up reads on an empty page", async () => {
    const { service, deps } = buildService();
    deps.secretChangeRequestDAL.findByProjectId.mockResolvedValueOnce({
      rows: [{ ...LIST_ROW, policyId: null, policyName: null, policySecretPath: null, policyApprovals: null }],
      totalCount: 1
    });

    const result = await service.listSecretChangeRequests(filter);
    expect(deps.approvalPolicyDAL.findBypassersByPolicyIds).toHaveBeenCalledWith([]);
    expect(result.approvals[0].policyId).toBeNull();
    expect(result.approvals[0].policy).toMatchObject({ id: "", approvals: 1, deletedAt: expect.any(Date) as Date });

    deps.approvalRequestDAL.findStepsByRequestIds.mockClear();
    await expect(service.listSecretChangeRequests(filter)).resolves.toEqual({ approvals: [], totalCount: 0 });
    expect(deps.approvalRequestDAL.findStepsByRequestIds).not.toHaveBeenCalled();
  });

  test("counts through the DAL", async () => {
    const { service, deps } = buildService();

    await expect(
      service.countSecretChangeRequests({ projectId: "project-1", userId: "approver-1", policyId: "policy-1" })
    ).resolves.toEqual({ open: 2, closed: 1 });
    expect(deps.secretChangeRequestDAL.countByProjectId).toHaveBeenCalledWith("project-1", "approver-1", "policy-1");
  });
});

describe("secretChangeRequestBridge createSecretChangeRequest", () => {
  const CREATE_DTO = {
    policy: { id: "policy-1" },
    folderId: "folder-1",
    actor: ActorType.USER,
    actorId: "user-1",
    isReplicated: true,
    commitMessage: "moved",
    commits: [
      { op: SecretOperations.Create, key: "NEW_KEY", encryptedValue: Buffer.from("v"), tagIds: ["tag-1"] },
      { op: SecretOperations.Delete, key: "OLD_KEY", secretId: "secret-2", secretVersion: "version-2" }
    ]
  };

  beforeEach(() => {
    resolveRequester.mockReset().mockResolvedValue(REQUESTER);
    runSecretChangeRequestSideEffects.mockClear();
  });

  const create = (service: ReturnType<typeof buildService>["service"], tx?: Knex) =>
    service.createSecretChangeRequest(
      CREATE_DTO as unknown as Parameters<ReturnType<typeof buildService>["service"]["createSecretChangeRequest"]>[0],
      tx
    );

  test("writes the request envelope, change row, commits and tags in the caller's transaction", async () => {
    const { service, deps } = buildService();
    deps.secretChangePolicyBridgeService.findSecretChangePolicyById.mockResolvedValue({
      ...POLICY,
      projectId: "project-1"
    });

    const result = await create(service, CALLER_TX);

    expect(deps.approvalRequestDAL.transaction).not.toHaveBeenCalled();
    expect(deps.secretChangePolicyBridgeService.findSecretChangePolicyById).toHaveBeenCalledWith("policy-1", CALLER_TX);
    expect(deps.projectDAL.findById).toHaveBeenCalledWith("project-1", CALLER_TX);
    expect(resolveRequester).toHaveBeenCalledWith(ActorType.USER, "user-1", CALLER_TX);
    expect(deps.approvalRequestDAL.create).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-1",
        organizationId: "org-1",
        policyId: "policy-1",
        type: ApprovalPolicyType.SecretChange,
        status: ApprovalRequestStatus.Open,
        requesterId: "user-1"
      }),
      CALLER_TX
    );
    expect(deps.secretChangeRequestDAL.create).toHaveBeenCalledWith(
      expect.objectContaining({
        approvalRequestId: "request-1",
        folderId: "folder-1",
        hasMerged: false,
        commitMessage: "moved",
        isReplicated: true
      }),
      CALLER_TX
    );
    expect(deps.secretApprovalRequestSecretDAL.insertV2Bridge).toHaveBeenCalledWith(
      [
        expect.objectContaining({ key: "NEW_KEY", op: SecretOperations.Create, secretChangeId: "change-1" }),
        expect.objectContaining({ key: "OLD_KEY", op: SecretOperations.Delete, secretChangeId: "change-1" })
      ],
      CALLER_TX
    );
    const [insertedCommits] = deps.secretApprovalRequestSecretDAL.insertV2Bridge.mock.calls[0];
    expect(insertedCommits[0]).not.toHaveProperty("tagIds");
    expect(deps.secretApprovalRequestSecretDAL.insertApprovalSecretV2Tags).toHaveBeenCalledWith(
      [{ secretId: "commit-0", tagId: "tag-1" }],
      CALLER_TX
    );
    expect(runSecretChangeRequestSideEffects).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      id: "request-1",
      policyId: "policy-1",
      status: ApprovalRequestStatus.Open,
      folderId: "folder-1",
      isReplicated: true,
      committerUserId: "user-1",
      commits: [expect.objectContaining({ key: "NEW_KEY" }), expect.objectContaining({ key: "OLD_KEY" })]
    });
  });

  test("opens its own transaction when the caller has none and skips the tag insert without tags", async () => {
    const { service, deps } = buildService();
    deps.secretChangePolicyBridgeService.findSecretChangePolicyById.mockResolvedValue({
      ...POLICY,
      projectId: "project-1"
    });

    await service.createSecretChangeRequest({
      ...CREATE_DTO,
      commits: [{ op: SecretOperations.Delete, key: "OLD_KEY", secretId: "secret-2" }]
    } as unknown as Parameters<ReturnType<typeof buildService>["service"]["createSecretChangeRequest"]>[0]);

    expect(deps.approvalRequestDAL.transaction).toHaveBeenCalledTimes(1);
    expect(deps.secretChangeRequestDAL.create).toHaveBeenCalledWith(expect.anything(), OWN_TX);
    expect(deps.secretApprovalRequestSecretDAL.insertApprovalSecretV2Tags).not.toHaveBeenCalled();
  });

  test("keeps the tags of every commit that shares a key, as the legacy system does", async () => {
    const { service, deps } = buildService();
    deps.secretChangePolicyBridgeService.findSecretChangePolicyById.mockResolvedValue({
      ...POLICY,
      projectId: "project-1"
    });

    await service.createSecretChangeRequest(
      {
        ...CREATE_DTO,
        commits: [
          { op: SecretOperations.Delete, key: "KEY", secretId: "secret-1", tagIds: ["tag-1"] },
          { op: SecretOperations.Create, key: "KEY", encryptedValue: Buffer.from("v"), tagIds: ["tag-2"] }
        ]
      } as unknown as Parameters<ReturnType<typeof buildService>["service"]["createSecretChangeRequest"]>[0],
      CALLER_TX
    );

    expect(deps.secretApprovalRequestSecretDAL.insertApprovalSecretV2Tags).toHaveBeenCalledWith(
      [
        { secretId: "commit-0", tagId: "tag-1" },
        { secretId: "commit-0", tagId: "tag-2" }
      ],
      CALLER_TX
    );
  });

  test("writes nothing when the policy is gone or has no approval step", async () => {
    const { service, deps } = buildService({ steps: [] });
    deps.secretChangePolicyBridgeService.findSecretChangePolicyById.mockResolvedValueOnce(null);
    await expect(create(service, CALLER_TX)).rejects.toBeInstanceOf(NotFoundError);

    deps.secretChangePolicyBridgeService.findSecretChangePolicyById.mockResolvedValueOnce({
      ...POLICY,
      projectId: "project-1"
    });
    await expect(create(service, CALLER_TX)).rejects.toThrow("has no approval step configured");
    expect(deps.approvalRequestDAL.create).not.toHaveBeenCalled();
  });
});

describe("secretChangeRequestBridge createSecretChangeRequestSideEffects", () => {
  const SIDE_EFFECTS_DTO = {
    secretApprovalRequest: { id: "request-1", policyId: "policy-1", commits: [{ id: "commit-1" }] },
    projectId: "project-1",
    environment: "dev",
    secretPath: "/app",
    secretKeys: ["NEW_KEY"],
    actor: ActorType.USER,
    actorId: "user-1",
    actorOrgId: "org-1"
  };

  beforeEach(() => {
    runSecretChangeRequestSideEffects.mockClear();
  });

  test("runs the bridge side effects for the stored request through the caller's transaction", async () => {
    const { service, deps } = buildService();

    await service.createSecretChangeRequestSideEffects({ ...SIDE_EFFECTS_DTO, tx: CALLER_TX });

    expect(deps.approvalRequestDAL.findById).toHaveBeenCalledWith("request-1", CALLER_TX);
    expect(deps.secretChangeRequestDAL.findOne).toHaveBeenCalledWith({ approvalRequestId: "request-1" }, CALLER_TX);
    expect(deps.secretChangePolicyBridgeService.findSecretChangePolicyById).toHaveBeenCalledWith("policy-1", CALLER_TX);
    expect(deps.projectDAL.findById).toHaveBeenCalledWith("project-1", CALLER_TX);
    expect(runSecretChangeRequestSideEffects).toHaveBeenCalledWith({
      approvalRequest: APPROVAL_REQUEST,
      secretChangeRequest: SECRET_CHANGE_REQUEST,
      policy: POLICY,
      project: PROJECT,
      commits: [{ id: "commit-1" }],
      environment: "dev",
      secretPath: "/app",
      secretKeys: ["NEW_KEY"],
      actor: ActorType.USER,
      actorId: "user-1",
      actorOrgId: "org-1",
      tx: CALLER_TX
    });
  });

  test("reads an unknown request as not found and refuses one whose policy is gone", async () => {
    const { service, deps } = buildService();

    deps.approvalRequestDAL.findById.mockResolvedValueOnce(null);
    await expect(service.createSecretChangeRequestSideEffects(SIDE_EFFECTS_DTO)).rejects.toBeInstanceOf(NotFoundError);

    deps.secretChangePolicyBridgeService.findSecretChangePolicyById.mockResolvedValueOnce(null);
    await expect(service.createSecretChangeRequestSideEffects(SIDE_EFFECTS_DTO)).rejects.toThrow("has been deleted");
    expect(runSecretChangeRequestSideEffects).not.toHaveBeenCalled();
  });
});
