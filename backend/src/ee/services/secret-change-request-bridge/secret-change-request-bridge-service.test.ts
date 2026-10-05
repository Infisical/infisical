import { Knex } from "knex";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { ProjectMembershipRole } from "@app/db/schemas";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import {
  ApprovalPolicyType,
  ApprovalRequestApprovalDecision,
  ApprovalRequestStatus,
  ApproverType
} from "@app/services/approval-policy/approval-policy-enums";
import { ActorType } from "@app/services/auth/auth-type";
import { SecretOperations } from "@app/services/secret/secret-types";
import { ChangeRequestWebhookAction } from "@app/services/webhook/webhook-types";

import { ApprovalStatus, RequestState } from "../secret-approval-request/secret-approval-request-types";
import { secretChangeRequestBridgeServiceFactory } from "./secret-change-request-bridge-service";

const buildSecretApprovalCommits = vi.fn();
const resolveRequester = vi.fn();
const runSecretChangeRequestSideEffects = vi.fn().mockResolvedValue(undefined);
const queueChangeRequestWebhook = vi.fn().mockResolvedValue(undefined);

vi.mock("@app/lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));
vi.mock("../secret-approval-request/secret-approval-request-commit-fns", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../secret-approval-request/secret-approval-request-commit-fns")>()),
  secretApprovalRequestCommitFnsFactory: () => ({ buildSecretApprovalCommits, validateSecrets: vi.fn() })
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
  approvals: []
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

const buildService = ({
  policy = POLICY as typeof POLICY | null,
  steps = [{ requiredApprovals: 1, approvers: [{ type: ApproverType.User, id: "approver-1" }] }]
} = {}) => {
  let requestCounter = 0;
  const hasRole = vi.fn().mockReturnValue(false);
  const deps = {
    approvalRequestDAL: {
      findById: vi.fn().mockResolvedValue(APPROVAL_REQUEST),
      findByIdForUpdate: vi.fn().mockResolvedValue(APPROVAL_REQUEST),
      findStepsByRequestId: vi.fn().mockResolvedValue([REQUEST_STEP]),
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
    approvalPolicyDAL: { findStepsByPolicyId: vi.fn().mockResolvedValue(steps) },
    secretChangeRequestDAL: {
      create: vi.fn((row: Record<string, unknown>) =>
        Promise.resolve({ id: "change-1", conflicts: null, bypassReason: null, statusChangedByUserId: null, ...row })
      ),
      findOne: vi.fn().mockResolvedValue(SECRET_CHANGE_REQUEST)
    },
    permissionService: { getProjectPermission: vi.fn().mockResolvedValue({ hasRole }) },
    licenseService: { getPlan: vi.fn().mockResolvedValue({ secretApproval: true }) },
    userGroupMembershipDAL: { findGroupMembershipsByUserIdInOrg: vi.fn().mockResolvedValue([]) },
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
      insertApprovalSecretV2Tags: vi.fn().mockResolvedValue([])
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
