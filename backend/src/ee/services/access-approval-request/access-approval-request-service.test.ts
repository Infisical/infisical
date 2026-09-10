import { describe, expect, test, vi } from "vitest";

import { BadRequestError, ForbiddenRequestError, InternalServerError, NotFoundError } from "@app/lib/errors";
import { ActorType } from "@app/services/auth/auth-type";

import {
  ExternalApprovalProductType,
  ExternalApprovalRequestStatus,
  ExternalApprovalType
} from "../external-approval/external-approval-enums";
import { accessApprovalRequestServiceFactory } from "./access-approval-request-service";
import { ApprovalStatus } from "./access-approval-request-types";

vi.mock("@app/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() }
}));

const REQUEST_ID = "22222222-2222-4222-8222-222222222222";
const EXTERNAL_REQUEST_ID = "55555555-5555-4555-8555-555555555555";
const EXTERNAL_POLICY_ID = "11111111-1111-4111-8111-111111111111";
const IDENTITY_ID = "33333333-3333-4333-8333-333333333333";
const PROJECT_ID = "66666666-6666-4666-8666-666666666666";
const ORG_ID = "77777777-7777-4777-8777-777777777777";
const EXTERNAL_ID = "sn-sys-id-1";

const identityActor = {
  type: ActorType.IDENTITY,
  id: IDENTITY_ID,
  authMethod: null,
  orgId: ORG_ID,
  rootOrgId: ORG_ID,
  parentOrgId: ORG_ID
} as never;

const TX = { marker: "tx" };

const buildRequest = (patch: Record<string, unknown> = {}) => ({
  id: REQUEST_ID,
  policyId: "policy-1",
  projectId: PROJECT_ID,
  status: ApprovalStatus.PENDING,
  isTemporary: false,
  temporaryRange: null,
  privilegeId: null,
  requestedByUserId: "user-1",
  permissions: [{ subject: "secrets", action: ["read"], conditions: { environment: "dev", secretPath: "/" } }],
  expiresAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  environment: "dev",
  policy: {
    id: "policy-1",
    name: "Policy",
    deletedAt: null,
    enforcementLevel: "hard",
    approvers: [],
    bypassers: [],
    externalApprovalPolicyId: EXTERNAL_POLICY_ID
  },
  externalApproval: {
    id: EXTERNAL_REQUEST_ID,
    status: ExternalApprovalRequestStatus.WaitingApproval,
    externalId: EXTERNAL_ID
  },
  requestedByUser: { userId: "user-1", email: "a@b.c", firstName: "A", lastName: "B", username: "a@b.c" },
  ...patch
});

const makeService = ({
  request = buildRequest(),
  lockedRow = { id: REQUEST_ID, status: ApprovalStatus.PENDING, privilegeId: null },
  canReview = true,
  canReadRequests = true,
  project = { id: PROJECT_ID, orgId: ORG_ID, name: "Project" }
}: {
  request?: ReturnType<typeof buildRequest> | undefined;
  lockedRow?: Record<string, unknown> | undefined;
  canReview?: boolean;
  canReadRequests?: boolean;
  project?: Record<string, unknown> | undefined;
} = {}) => {
  const accessApprovalRequestDAL = {
    findById: vi.fn().mockResolvedValue(request),
    findByIdForUpdate: vi.fn().mockResolvedValue(lockedRow),
    updateById: vi
      .fn<(id: string, patch: Record<string, unknown>, tx?: unknown) => Promise<Record<string, unknown>>>()
      .mockImplementation(async (id, patch) => ({ ...lockedRow, id, ...patch })),
    transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(TX))
  };
  const additionalPrivilegeDAL = { create: vi.fn().mockResolvedValue({ id: "priv-1" }) };
  const externalApprovalService = {
    authorizeExternalReview: vi.fn().mockResolvedValue({
      id: EXTERNAL_POLICY_ID,
      type: ExternalApprovalType.ServiceNow,
      approverIdentityId: IDENTITY_ID
    }),
    canReviewExternalApprovals: vi.fn().mockResolvedValue(canReview),
    resolveExternalApprovalDecision: vi.fn().mockResolvedValue({ alreadyFinalized: false })
  };
  const externalApprovalPolicyDAL = {
    findById: vi.fn().mockResolvedValue({ id: EXTERNAL_POLICY_ID, type: ExternalApprovalType.ServiceNow })
  };
  const permissionService = {
    getProjectPermission: vi.fn().mockResolvedValue({ permission: { can: vi.fn(() => canReadRequests) } })
  };
  const externalApprovalQueue = { queueExternalApprovalDispatch: vi.fn().mockResolvedValue(undefined) };
  const externalApprovalRequestDAL = {
    create: vi.fn(),
    updateById: vi.fn().mockResolvedValue(undefined),
    update: vi
      .fn<(filter: Record<string, unknown>, patch: Record<string, unknown>) => Promise<Record<string, unknown>[]>>()
      .mockImplementation(async (filter, patch) => [{ ...filter, ...patch }])
  };
  const projectDAL = { findById: vi.fn().mockResolvedValue(project) };
  const queueService = { queue: vi.fn().mockResolvedValue(undefined) };
  const projectEnvDAL = { findOne: vi.fn().mockResolvedValue({ name: "Development" }) };

  const service = accessApprovalRequestServiceFactory({
    accessApprovalRequestDAL: accessApprovalRequestDAL as never,
    additionalPrivilegeDAL: additionalPrivilegeDAL as never,
    externalApprovalService: externalApprovalService as never,
    permissionService: permissionService as never,
    projectDAL: projectDAL as never,
    projectEnvDAL: projectEnvDAL as never,
    queueService: queueService as never,
    accessApprovalRequestReviewerDAL: {} as never,
    accessApprovalPolicyDAL: {} as never,
    accessApprovalPolicyApproverDAL: {} as never,
    groupDAL: {} as never,
    smtpService: {} as never,
    userDAL: {} as never,
    kmsService: {} as never,
    microsoftTeamsService: {} as never,
    projectMicrosoftTeamsConfigDAL: {} as never,
    projectSlackConfigDAL: {} as never,
    notificationService: {} as never,
    externalApprovalQueue: externalApprovalQueue as never,
    externalApprovalRequestDAL: externalApprovalRequestDAL as never,
    externalApprovalPolicyDAL: externalApprovalPolicyDAL as never
  });

  return {
    service,
    accessApprovalRequestDAL,
    additionalPrivilegeDAL,
    externalApprovalService,
    permissionService,
    externalApprovalQueue,
    externalApprovalRequestDAL
  };
};

const review = (
  service: ReturnType<typeof makeService>["service"],
  status: ApprovalStatus.APPROVED | ApprovalStatus.REJECTED
) =>
  service.reviewExternalAccessRequest({ requestId: REQUEST_ID, externalId: EXTERNAL_ID, status, actor: identityActor });

describe("accessApprovalRequestService.reviewExternalAccessRequest", () => {
  test("approval records the external decision, grants the privilege, and leaves approvedByUserId null", async () => {
    const { service, accessApprovalRequestDAL, additionalPrivilegeDAL, externalApprovalService } = makeService();

    const result = await review(service, ApprovalStatus.APPROVED);

    expect(externalApprovalService.resolveExternalApprovalDecision).toHaveBeenCalledWith(
      {
        externalApprovalRequestId: EXTERNAL_REQUEST_ID,
        externalId: EXTERNAL_ID,
        status: ApprovalStatus.APPROVED
      },
      TX
    );
    expect(additionalPrivilegeDAL.create).toHaveBeenCalledTimes(1);
    expect(additionalPrivilegeDAL.create.mock.calls[0][1]).toBe(TX);

    const updateCall = accessApprovalRequestDAL.updateById.mock.calls.find(([id]) => id === REQUEST_ID);
    expect(updateCall).toBeDefined();
    const [, patch, tx] = updateCall!;
    expect(patch.status).toBe(ApprovalStatus.APPROVED);
    expect(patch.privilegeId).toBe("priv-1");
    expect(patch.approvedByUserId).toBeNull();
    expect(tx).toBe(TX);

    expect(accessApprovalRequestDAL.findByIdForUpdate).toHaveBeenCalledWith(REQUEST_ID, TX);
    expect(result.projectId).toBe(PROJECT_ID);
    expect(result.externalApprovalRequestId).toBe(EXTERNAL_REQUEST_ID);
    expect(result.externalApprovalPolicyId).toBe(EXTERNAL_POLICY_ID);
    expect(result.externalApprovalProvider).toBe("ServiceNow");
  });

  test("rejection closes the request without creating a privilege", async () => {
    const { service, accessApprovalRequestDAL, additionalPrivilegeDAL } = makeService();

    await review(service, ApprovalStatus.REJECTED);

    expect(additionalPrivilegeDAL.create).not.toHaveBeenCalled();
    expect(accessApprovalRequestDAL.updateById).toHaveBeenCalledWith(
      REQUEST_ID,
      { status: ApprovalStatus.REJECTED },
      TX
    );
  });

  test("a request in another org is reported as not found before any authorization", async () => {
    const { service, externalApprovalService } = makeService({ project: { id: PROJECT_ID, orgId: "other-org" } });

    await expect(review(service, ApprovalStatus.APPROVED)).rejects.toBeInstanceOf(NotFoundError);
    expect(externalApprovalService.authorizeExternalReview).not.toHaveBeenCalled();
  });

  test("a request without an external approval policy is a 400", async () => {
    const { service } = makeService({
      request: buildRequest({
        externalApproval: null,
        policy: { ...buildRequest().policy, externalApprovalPolicyId: null }
      })
    });

    await expect(review(service, ApprovalStatus.APPROVED)).rejects.toBeInstanceOf(BadRequestError);
  });

  test("an identity without the Review permission on External Approvals is forbidden", async () => {
    const { service, accessApprovalRequestDAL, externalApprovalService } = makeService({ canReview: false });

    await expect(review(service, ApprovalStatus.APPROVED)).rejects.toBeInstanceOf(ForbiddenRequestError);
    expect(externalApprovalService.canReviewExternalApprovals).toHaveBeenCalledWith({
      actor: identityActor
    });
    expect(accessApprovalRequestDAL.transaction).not.toHaveBeenCalled();
  });

  test("replaying the same decision on a closed request returns it without writing", async () => {
    const { service, accessApprovalRequestDAL } = makeService({
      request: buildRequest({
        status: ApprovalStatus.APPROVED,
        externalApproval: {
          id: EXTERNAL_REQUEST_ID,
          status: ExternalApprovalRequestStatus.Approved,
          externalId: EXTERNAL_ID
        }
      })
    });

    const result = await review(service, ApprovalStatus.APPROVED);

    expect(result.request.status).toBe(ApprovalStatus.APPROVED);
    expect(accessApprovalRequestDAL.transaction).not.toHaveBeenCalled();
  });

  test("a closed request with a different decision is a 400", async () => {
    const { service } = makeService({ request: buildRequest({ status: ApprovalStatus.REJECTED }) });

    await expect(review(service, ApprovalStatus.APPROVED)).rejects.toBeInstanceOf(BadRequestError);
  });

  test("a request closed between the read and the lock does not grant", async () => {
    const { service, additionalPrivilegeDAL } = makeService({
      lockedRow: { id: REQUEST_ID, status: ApprovalStatus.REJECTED, privilegeId: null }
    });

    await expect(review(service, ApprovalStatus.APPROVED)).rejects.toBeInstanceOf(BadRequestError);
    expect(additionalPrivilegeDAL.create).not.toHaveBeenCalled();
  });
});

const USER_ID = "44444444-4444-4444-8444-444444444444";

const failedRequest = (patch: Record<string, unknown> = {}) =>
  buildRequest({
    externalApproval: {
      id: EXTERNAL_REQUEST_ID,
      status: ExternalApprovalRequestStatus.FailedDispatch,
      externalId: null
    },
    ...patch
  });

const retry = (service: ReturnType<typeof makeService>["service"]) =>
  service.retryExternalApprovalDispatch({
    requestId: REQUEST_ID,
    actor: ActorType.USER,
    actorId: USER_ID,
    actorOrgId: ORG_ID,
    actorAuthMethod: null
  });

describe("accessApprovalRequestService.retryExternalApprovalDispatch", () => {
  test("resets a failed dispatch to pending and queues the job again", async () => {
    const { service, accessApprovalRequestDAL, externalApprovalRequestDAL, externalApprovalQueue } = makeService({
      request: failedRequest()
    });

    const result = await retry(service);

    expect(accessApprovalRequestDAL.findById).toHaveBeenCalledWith(REQUEST_ID, TX);
    expect(externalApprovalRequestDAL.update).toHaveBeenCalledWith(
      { id: EXTERNAL_REQUEST_ID, status: ExternalApprovalRequestStatus.FailedDispatch },
      { status: ExternalApprovalRequestStatus.PendingDispatch },
      TX
    );
    expect(externalApprovalQueue.queueExternalApprovalDispatch).toHaveBeenCalledWith({
      externalApprovalRequestId: EXTERNAL_REQUEST_ID,
      accessApprovalRequestId: REQUEST_ID,
      projectId: PROJECT_ID,
      productType: ExternalApprovalProductType.SecretsManagement
    });
    expect(result.projectId).toBe(PROJECT_ID);
    expect(result.externalApprovalRequestId).toBe(EXTERNAL_REQUEST_ID);
    expect(result.externalApprovalPolicyId).toBe(EXTERNAL_POLICY_ID);
    expect(result.externalApprovalProvider).toBe("ServiceNow");
  });

  test("an actor without Read on Approval Requests is forbidden before anything is written", async () => {
    const { service, accessApprovalRequestDAL, externalApprovalRequestDAL, externalApprovalQueue } = makeService({
      request: failedRequest(),
      canReadRequests: false
    });

    await expect(retry(service)).rejects.toBeInstanceOf(ForbiddenRequestError);
    expect(accessApprovalRequestDAL.transaction).not.toHaveBeenCalled();
    expect(externalApprovalRequestDAL.update).not.toHaveBeenCalled();
    expect(externalApprovalQueue.queueExternalApprovalDispatch).not.toHaveBeenCalled();
  });

  test("a request in another org is reported as not found before the permission check", async () => {
    const { service, permissionService } = makeService({
      request: failedRequest(),
      project: { id: PROJECT_ID, orgId: "other-org" }
    });

    await expect(retry(service)).rejects.toBeInstanceOf(NotFoundError);
    expect(permissionService.getProjectPermission).not.toHaveBeenCalled();
  });

  test("a request without an external approval policy is a 400", async () => {
    const { service } = makeService({
      request: buildRequest({
        externalApproval: null,
        policy: { ...buildRequest().policy, externalApprovalPolicyId: null }
      })
    });

    await expect(retry(service)).rejects.toBeInstanceOf(BadRequestError);
  });

  test.each([
    ExternalApprovalRequestStatus.PendingDispatch,
    ExternalApprovalRequestStatus.WaitingApproval,
    ExternalApprovalRequestStatus.Approved,
    ExternalApprovalRequestStatus.Rejected
  ])("an external approval in status %s cannot be resent", async (status) => {
    const { service, externalApprovalRequestDAL, externalApprovalQueue } = makeService({
      request: buildRequest({ externalApproval: { id: EXTERNAL_REQUEST_ID, status, externalId: null } })
    });

    await expect(retry(service)).rejects.toBeInstanceOf(BadRequestError);
    expect(externalApprovalRequestDAL.update).not.toHaveBeenCalled();
    expect(externalApprovalQueue.queueExternalApprovalDispatch).not.toHaveBeenCalled();
  });

  test("a closed request cannot be resent", async () => {
    const { service } = makeService({ request: failedRequest({ status: ApprovalStatus.REJECTED }) });

    await expect(retry(service)).rejects.toBeInstanceOf(BadRequestError);
  });

  test("a concurrent retry that already reset the status succeeds without queueing twice", async () => {
    const { service, externalApprovalRequestDAL, externalApprovalQueue } = makeService({ request: failedRequest() });
    externalApprovalRequestDAL.update.mockResolvedValueOnce([]);

    const result = await retry(service);

    expect(result.projectId).toBe(PROJECT_ID);
    expect(result.externalApprovalRequestId).toBe(EXTERNAL_REQUEST_ID);
    expect(externalApprovalRequestDAL.update).toHaveBeenCalledWith(
      { id: EXTERNAL_REQUEST_ID, status: ExternalApprovalRequestStatus.FailedDispatch },
      { status: ExternalApprovalRequestStatus.PendingDispatch },
      TX
    );
    expect(externalApprovalQueue.queueExternalApprovalDispatch).not.toHaveBeenCalled();
  });

  test("a queue failure marks the dispatch failed again and surfaces an error", async () => {
    const { service, externalApprovalRequestDAL, externalApprovalQueue } = makeService({ request: failedRequest() });
    externalApprovalQueue.queueExternalApprovalDispatch.mockRejectedValueOnce(new Error("redis down"));

    await expect(retry(service)).rejects.toBeInstanceOf(InternalServerError);
    expect(externalApprovalRequestDAL.updateById).toHaveBeenCalledWith(EXTERNAL_REQUEST_ID, {
      status: ExternalApprovalRequestStatus.FailedDispatch
    });
  });
});
