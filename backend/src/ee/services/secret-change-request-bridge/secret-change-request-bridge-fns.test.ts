import { Knex } from "knex";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { TApprovalRequestApprovals, TApprovalRequests, TSecretChangeRequests } from "@app/db/schemas";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { EnforcementLevel } from "@app/lib/types";
import { triggerWorkflowIntegrationNotification } from "@app/lib/workflow-integrations/trigger-notification";
import { QueueJobs, QueueName } from "@app/queue";
import {
  ApprovalPolicyType,
  ApprovalRequestApprovalDecision,
  ApprovalRequestStatus
} from "@app/services/approval-policy/approval-policy-enums";
import { ActorType } from "@app/services/auth/auth-type";
import { NotificationType } from "@app/services/notification/notification-types";
import { SmtpTemplates } from "@app/services/smtp/smtp-service";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";
import { ChangeRequestWebhookAction, WebhookEvents } from "@app/services/webhook/webhook-types";

import { ApprovalStatus, RequestState } from "../secret-approval-request/secret-approval-request-types";
import {
  secretChangeRequestFnsFactory,
  toSecretChangeRequest,
  toSecretChangeRequestReview
} from "./secret-change-request-bridge-fns";

vi.mock("@app/lib/config/env", () => ({ getConfig: () => ({ SITE_URL: "https://app.test" }) }));
vi.mock("@app/lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));
vi.mock("@app/lib/workflow-integrations/trigger-notification", () => ({
  triggerWorkflowIntegrationNotification: vi.fn().mockResolvedValue(undefined)
}));

const TX = { isTx: true } as unknown as Knex;
const CREATED_AT = new Date("2026-01-01T00:00:00.000Z");

const approvalRequest = (overrides: Partial<TApprovalRequests> = {}): TApprovalRequests => ({
  id: "request-1",
  projectId: "project-1",
  organizationId: "org-1",
  policyId: "policy-1",
  requesterId: "user-1",
  requesterName: "Alice Smith",
  requesterEmail: "alice@example.com",
  type: ApprovalPolicyType.SecretChange,
  status: ApprovalRequestStatus.Open,
  justification: null,
  currentStep: 1,
  requestData: { version: 1, requestData: {} },
  expiresAt: null,
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
  machineIdentityId: null,
  scopeType: null,
  scopeId: null,
  ...overrides
});

const secretChangeRequest = (overrides: Partial<TSecretChangeRequests> = {}): TSecretChangeRequests => ({
  id: "change-1",
  approvalRequestId: "request-1",
  folderId: "folder-1",
  statusChangedByUserId: null,
  slug: "slug-1",
  hasMerged: false,
  conflicts: null,
  commitMessage: "msg",
  bypassReason: null,
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
  ...overrides
});

describe("toSecretChangeRequest", () => {
  test("exposes the approval request id as the request id and maps the legacy columns", () => {
    const commits = [{ id: "commit-1", key: "KEY", op: "create" }] as never[];

    const result = toSecretChangeRequest({
      approvalRequest: approvalRequest(),
      secretChangeRequest: secretChangeRequest(),
      commits
    });

    expect(result).toEqual({
      id: "request-1",
      policyId: "policy-1",
      status: RequestState.Open,
      hasMerged: false,
      conflicts: null,
      slug: "slug-1",
      folderId: "folder-1",
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
      isReplicated: null,
      committerUserId: "user-1",
      committerIdentityId: null,
      statusChangedByUserId: null,
      bypassReason: null,
      commitMessage: "msg",
      commits
    });
  });

  test("passes the close status through and maps an identity requester onto committerIdentityId", () => {
    const result = toSecretChangeRequest({
      approvalRequest: approvalRequest({
        status: ApprovalRequestStatus.Closed,
        requesterId: null,
        machineIdentityId: "identity-1"
      }),
      secretChangeRequest: secretChangeRequest({
        statusChangedByUserId: "user-2",
        bypassReason: "hotfix",
        isReplicated: true
      }),
      commits: []
    });

    expect(result).toMatchObject({
      status: RequestState.Closed,
      committerUserId: null,
      committerIdentityId: "identity-1",
      statusChangedByUserId: "user-2",
      bypassReason: "hotfix",
      isReplicated: true
    });
    expect(result.status).toBe("close");
  });
});

describe("toSecretChangeRequestReview", () => {
  const approval = (overrides: Partial<TApprovalRequestApprovals> = {}): TApprovalRequestApprovals => ({
    id: "approval-1",
    stepId: "step-1",
    approverUserId: "user-2",
    decision: ApprovalRequestApprovalDecision.Approved,
    comment: "ship it",
    createdAt: CREATED_AT,
    ...overrides
  });

  test("maps a decision row onto the legacy reviewer shape and echoes createdAt as updatedAt", () => {
    expect(toSecretChangeRequestReview(approval(), "request-1")).toEqual({
      id: "approval-1",
      status: ApprovalStatus.APPROVED,
      requestId: "request-1",
      reviewerUserId: "user-2",
      comment: "ship it",
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT
    });
  });

  test("normalizes a missing comment to null and a missing createdAt to now", () => {
    const result = toSecretChangeRequestReview(
      approval({ decision: ApprovalRequestApprovalDecision.Rejected, comment: undefined, createdAt: null }),
      "request-1"
    );

    expect(result).toMatchObject({ status: ApprovalStatus.REJECTED, comment: null });
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.updatedAt).toBe(result.createdAt);
  });
});

const buildFns = ({
  user = {
    id: "user-1",
    firstName: "Alice",
    lastName: "Smith",
    username: "alice",
    email: "alice@example.com"
  } as Record<string, unknown> | null,
  identity = { id: "identity-1", name: "ci-bot" } as Record<string, unknown> | null,
  approvers = [
    { id: "user-2", firstName: "Bob", email: "bob@example.com" },
    { id: "user-3", firstName: "Eve", email: null }
  ]
} = {}) => {
  const deps = {
    userDAL: {
      findById: vi.fn().mockResolvedValue(user),
      find: vi.fn().mockResolvedValue(approvers)
    },
    identityDAL: { findById: vi.fn().mockResolvedValue(identity) },
    projectDAL: {
      findById: vi.fn(),
      findProjectWithOrg: vi
        .fn()
        .mockResolvedValue({ id: "project-1", name: "Project", orgId: "org-1", organization: { name: "Org" } })
    },
    projectEnvDAL: { findOne: vi.fn().mockResolvedValue({ id: "env-1", name: "Development", slug: "dev" }) },
    kmsService: { createCipherPairWithDataKey: vi.fn() },
    projectSlackConfigDAL: { getIntegrationDetailsByProject: vi.fn() },
    projectMicrosoftTeamsConfigDAL: { getIntegrationDetailsByProject: vi.fn() },
    microsoftTeamsService: { sendNotification: vi.fn() },
    smtpService: { sendMail: vi.fn().mockResolvedValue(undefined) },
    notificationService: { createUserNotifications: vi.fn().mockResolvedValue(undefined) },
    queueService: { queue: vi.fn().mockResolvedValue(undefined) },
    telemetryService: { sendPostHogEvents: vi.fn().mockResolvedValue(undefined) }
  };
  const fns = secretChangeRequestFnsFactory(deps as unknown as Parameters<typeof secretChangeRequestFnsFactory>[0]);
  return { fns, deps };
};

describe("resolveRequester", () => {
  test("snapshots a user's full name and email and threads the transaction", async () => {
    const { fns, deps } = buildFns();

    await expect(fns.resolveRequester(ActorType.USER, "user-1", TX)).resolves.toEqual({
      requesterUserId: "user-1",
      machineIdentityId: null,
      requesterName: "Alice Smith",
      requesterEmail: "alice@example.com"
    });
    expect(deps.userDAL.findById).toHaveBeenCalledWith("user-1", TX);
  });

  test("falls back to the username when the user has no name", async () => {
    const { fns } = buildFns({
      user: { id: "user-1", firstName: null, lastName: null, username: "alice", email: null }
    });

    await expect(fns.resolveRequester(ActorType.USER, "user-1")).resolves.toMatchObject({
      requesterName: "alice",
      requesterEmail: ""
    });
  });

  test("records a machine identity under machineIdentityId with an empty email", async () => {
    const { fns, deps } = buildFns();

    await expect(fns.resolveRequester(ActorType.IDENTITY, "identity-1", TX)).resolves.toEqual({
      requesterUserId: null,
      machineIdentityId: "identity-1",
      requesterName: "ci-bot",
      requesterEmail: ""
    });
    expect(deps.identityDAL.findById).toHaveBeenCalledWith("identity-1", TX);
  });

  test("rejects a missing user and an unsupported actor type", async () => {
    const { fns } = buildFns({ user: null });

    await expect(fns.resolveRequester(ActorType.USER, "user-1")).rejects.toBeInstanceOf(NotFoundError);
    await expect(fns.resolveRequester(ActorType.PLATFORM, "x")).rejects.toBeInstanceOf(BadRequestError);
  });
});

describe("queueChangeRequestWebhook", () => {
  test("queues the change request webhook under the given action", async () => {
    const { fns, deps } = buildFns();

    await fns.queueChangeRequestWebhook({
      action: ChangeRequestWebhookAction.Reviewed,
      approvalRequest: approvalRequest(),
      secretChangeRequest: secretChangeRequest({ bypassReason: "hotfix" }),
      policy: { id: "policy-1", name: "dev-policy", enforcementLevel: EnforcementLevel.Soft, userApprovers: [] },
      project: { id: "project-1", name: "Project", orgId: "org-1" },
      environment: "dev",
      environmentName: "Development",
      secretPath: "/app"
    });

    expect(deps.queueService.queue).toHaveBeenCalledWith(
      QueueName.SecretWebhook,
      QueueJobs.SecWebhook,
      {
        type: WebhookEvents.ChangeRequestModified,
        payload: {
          projectId: "project-1",
          projectName: "Project",
          environment: "dev",
          environmentName: "Development",
          secretPath: "/app",
          action: ChangeRequestWebhookAction.Reviewed,
          request: expect.objectContaining({
            id: "request-1",
            slug: "slug-1",
            isBypassed: true,
            policy: { id: "policy-1", name: "dev-policy", enforcementLevel: EnforcementLevel.Soft }
          }) as object
        }
      },
      expect.objectContaining({ jobId: expect.stringContaining("change-request-webhook-request-1-") as string })
    );
  });
});

describe("runSecretChangeRequestSideEffects", () => {
  const policy = {
    id: "policy-1",
    name: "dev-policy",
    enforcementLevel: EnforcementLevel.Hard,
    userApprovers: [{ userId: "user-2" }, { userId: "user-3" }, { userId: "user-2" }]
  };
  const project = { id: "project-1", name: "Project", orgId: "org-1" };
  const input = {
    approvalRequest: approvalRequest(),
    secretChangeRequest: secretChangeRequest(),
    policy,
    project,
    commits: [{ id: "commit-1" }, { id: "commit-2" }],
    environment: "dev",
    secretPath: "/",
    secretKeys: ["KEY"],
    actor: ActorType.USER,
    actorId: "user-1",
    actorOrgId: "org-1"
  };

  beforeEach(() => {
    vi.mocked(triggerWorkflowIntegrationNotification).mockClear();
  });

  test("notifies workflow integrations, approvers, the webhook queue and telemetry", async () => {
    const { fns, deps } = buildFns();

    await fns.runSecretChangeRequestSideEffects(input);

    expect(triggerWorkflowIntegrationNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        input: {
          projectId: "project-1",
          notification: {
            type: "secret-approval",
            payload: expect.objectContaining({
              userEmail: "alice@example.com",
              machineIdentityId: undefined,
              environment: "Development",
              requestId: "request-1",
              secretKeys: ["KEY"],
              approvalUrl:
                "https://app.test/organizations/org-1/projects/secret-management/project-1/approval?requestId=request-1"
            }) as object
          }
        }
      })
    );

    expect(deps.userDAL.find).toHaveBeenCalledWith({ $in: { id: ["user-2", "user-3"] } }, { tx: undefined });
    expect(deps.notificationService.createUserNotifications).toHaveBeenCalledWith([
      expect.objectContaining({ userId: "user-2", type: NotificationType.SECRET_CHANGE_REQUEST }),
      expect.objectContaining({ userId: "user-3", type: NotificationType.SECRET_CHANGE_REQUEST })
    ]);
    expect(deps.smtpService.sendMail).toHaveBeenCalledTimes(1);
    expect(deps.smtpService.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        recipients: ["bob@example.com"],
        template: SmtpTemplates.SecretApprovalRequestNeedsReview,
        substitutions: expect.objectContaining({
          firstName: "Bob",
          projectName: "Project",
          organizationName: "Org"
        }) as object
      })
    );

    expect(deps.queueService.queue).toHaveBeenCalledWith(
      QueueName.SecretWebhook,
      QueueJobs.SecWebhook,
      {
        type: WebhookEvents.ChangeRequestModified,
        payload: expect.objectContaining({
          projectId: "project-1",
          environment: "dev",
          environmentName: "Development",
          action: ChangeRequestWebhookAction.Created,
          request: {
            id: "request-1",
            slug: "slug-1",
            url: "https://app.test/organizations/org-1/projects/secret-management/project-1/approval?requestId=request-1",
            status: RequestState.Open,
            hasMerged: false,
            isBypassed: false,
            policy: { id: "policy-1", name: "dev-policy", enforcementLevel: EnforcementLevel.Hard },
            requestedBy: { type: ActorType.USER, id: "user-1", name: "Alice Smith", email: "alice@example.com" },
            createdAt: CREATED_AT.toISOString(),
            updatedAt: CREATED_AT.toISOString()
          }
        }) as object
      },
      expect.objectContaining({ attempts: 5, delay: 1000 })
    );

    expect(deps.telemetryService.sendPostHogEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        event: PostHogEventTypes.SecretApprovalRequestSubmitted,
        distinctId: "alice",
        organizationId: "org-1",
        properties: expect.objectContaining({
          requestId: "request-1",
          policyId: "policy-1",
          numberOfCommits: 2
        }) as object
      })
    );
  });

  test("reads through the caller's transaction and rethrows a webhook failure when one is supplied", async () => {
    const { fns, deps } = buildFns();
    deps.queueService.queue.mockRejectedValueOnce(new Error("redis down"));

    await expect(fns.runSecretChangeRequestSideEffects({ ...input, tx: TX })).rejects.toThrow("redis down");

    expect(deps.userDAL.findById).toHaveBeenCalledWith("user-1", TX);
    expect(deps.projectEnvDAL.findOne).toHaveBeenCalledWith({ slug: "dev", projectId: "project-1" }, TX);
    expect(deps.userDAL.find).toHaveBeenCalledWith({ $in: { id: ["user-2", "user-3"] } }, { tx: TX });
    expect(deps.projectDAL.findProjectWithOrg).toHaveBeenCalledWith("project-1", TX);
  });

  test("logs a webhook failure instead of throwing when there is no caller transaction", async () => {
    const { fns, deps } = buildFns();
    deps.queueService.queue.mockRejectedValueOnce(new Error("redis down"));

    await expect(fns.runSecretChangeRequestSideEffects(input)).resolves.toBeUndefined();
    expect(deps.telemetryService.sendPostHogEvents).toHaveBeenCalled();
  });

  test("skips the user lookup and emails for a machine identity requester", async () => {
    const { fns, deps } = buildFns({ approvers: [] });

    await fns.runSecretChangeRequestSideEffects({
      ...input,
      approvalRequest: approvalRequest({ requesterId: null, machineIdentityId: "identity-1" }),
      policy: { ...policy, userApprovers: [] },
      actor: ActorType.IDENTITY,
      actorId: "identity-1"
    });

    expect(deps.userDAL.findById).not.toHaveBeenCalled();
    expect(deps.userDAL.find).not.toHaveBeenCalled();
    expect(deps.smtpService.sendMail).not.toHaveBeenCalled();
    expect(deps.queueService.queue).toHaveBeenCalledWith(
      QueueName.SecretWebhook,
      QueueJobs.SecWebhook,
      expect.objectContaining({
        payload: expect.objectContaining({
          request: expect.objectContaining({ requestedBy: null }) as object
        }) as object
      }),
      expect.anything()
    );
    expect(deps.telemetryService.sendPostHogEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        distinctId: "identity-1",
        properties: expect.objectContaining({ actorType: "identity" }) as object
      })
    );
  });
});
