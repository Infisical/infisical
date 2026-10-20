import { createMongoAbility, ForbiddenError } from "@casl/ability";
import { describe, expect, test, vi } from "vitest";

import { ApprovalStatus } from "@app/ee/services/access-approval-request/access-approval-request-types";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { ApprovalRequestStatus } from "@app/services/approval-policy/approval-policy-enums";
import { ActorType, AuthMethod } from "@app/services/auth/auth-type";
import { DelegatedApprovalRequestStatus } from "@app/services/delegated-approval/delegated-approval-enums";

import { externallyReviewedAccessRequestMessage } from "./secret-access-approval-global-request-bridge-constants";
import { secretAccessApprovalGlobalRequestBridgeServiceFactory } from "./secret-access-approval-global-request-bridge-service";

const pendingRequest = {
  id: "req-1",
  policyId: "policy-1",
  requesterId: "requester",
  organizationId: "org-1",
  projectId: "project-1",
  requestData: {
    version: 1,
    requestData: {
      permissions: [["read", "secrets", { environment: "dev", secretPath: { $glob: "/app" } }]],
      isTemporary: false,
      temporaryRange: null
    }
  },
  justification: null,
  status: ApprovalRequestStatus.Pending,
  expiresAt: null,
  grant: null,
  privilegeId: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z")
};

const delegatedRequest = {
  id: "delegated-1",
  requestId: "req-1",
  status: DelegatedApprovalRequestStatus.WaitingApproval
};

const canEditPolicies = createMongoAbility([
  { action: ProjectPermissionActions.Edit, subject: ProjectPermissionSub.SecretApproval }
]);
const cannotEditPolicies = createMongoAbility([
  { action: ProjectPermissionActions.Read, subject: ProjectPermissionSub.SecretApproval }
]);

const delegatedPolicy = {
  id: "policy-1",
  name: "Prod access",
  delegatedApproval: { type: "servicenow", connectionId: "connection-1" }
};

const createService = ({
  lockedRequest = pendingRequest as unknown,
  delegated = delegatedRequest as unknown,
  policy = delegatedPolicy as unknown,
  permission = cannotEditPolicies
} = {}) => {
  let current = { ...pendingRequest };
  const updateById = vi.fn().mockImplementation(async (_id: string, patch: Partial<typeof pendingRequest>) => {
    current = { ...current, ...patch };
    return current;
  });

  const service = secretAccessApprovalGlobalRequestBridgeServiceFactory({
    secretAccessApprovalGlobalRequestBridgeDAL: {
      findSecretAccessRequestById: vi.fn().mockImplementation(async () => current)
    },
    secretAccessApprovalGlobalPolicyBridgeDAL: {
      findSecretAccessPolicies: vi.fn().mockResolvedValue(policy ? [policy] : [])
    },
    permissionService: { getProjectPermission: vi.fn().mockResolvedValue({ permission }) },
    delegatedApprovalService: { getRequestByRequestId: vi.fn().mockResolvedValue(delegated) },
    approvalRequestDAL: {
      transaction: vi.fn().mockImplementation(async (cb: (tx: string) => unknown) => cb("tx")),
      findByIdForUpdate: vi.fn().mockResolvedValue(lockedRequest),
      updateById
    }
  } as never);

  return { service, updateById };
};

const cancelAs = (service: ReturnType<typeof createService>["service"], actorId: string) =>
  service.cancelAccessApprovalRequest({
    requestId: "req-1",
    actor: ActorType.USER,
    actorId,
    actorOrgId: "org-1",
    actorAuthMethod: AuthMethod.EMAIL
  });

describe("secretAccessApprovalGlobalRequestBridge.cancelAccessApprovalRequest", () => {
  test("lets the requester cancel their own pending delegated request", async () => {
    const { service, updateById } = createService();

    const result = await cancelAs(service, "requester");

    expect(updateById).toHaveBeenCalledWith("req-1", { status: ApprovalRequestStatus.Cancelled }, "tx");
    expect(result.projectId).toBe("project-1");
    expect(result.request).toMatchObject({ id: "req-1", policyId: "policy-1", status: ApprovalStatus.REJECTED });
  });

  test("lets a user who can edit approval policies cancel someone else's request", async () => {
    const { service, updateById } = createService({ permission: canEditPolicies });

    await cancelAs(service, "policy-admin");

    expect(updateById).toHaveBeenCalledWith("req-1", { status: ApprovalRequestStatus.Cancelled }, "tx");
  });

  test("refuses someone else's request when the actor cannot edit approval policies", async () => {
    const { service, updateById } = createService();

    await expect(cancelAs(service, "bystander")).rejects.toBeInstanceOf(ForbiddenError);
    expect(updateById).not.toHaveBeenCalled();
  });

  test("refuses a request that is not reviewed in an external approval system", async () => {
    const { service, updateById } = createService({ delegated: null });

    await expect(cancelAs(service, "requester")).rejects.toThrow(
      "Access request with ID 'req-1' is not reviewed in an external approval system. Reject it instead."
    );
    expect(updateById).not.toHaveBeenCalled();
  });

  test("refuses a request that was closed before the lock was taken", async () => {
    const { service, updateById } = createService({
      lockedRequest: { ...pendingRequest, status: ApprovalRequestStatus.Approved }
    });

    await expect(cancelAs(service, "requester")).rejects.toThrow("Only pending requests can be cancelled");
    expect(updateById).not.toHaveBeenCalled();
  });
});

describe("secretAccessApprovalGlobalRequestBridge.reviewAccessApprovalRequest", () => {
  const reviewAs = (service: ReturnType<typeof createService>["service"], status: ApprovalStatus) =>
    service.reviewAccessApprovalRequest({
      requestId: "req-1",
      status,
      actor: ActorType.USER,
      actorId: "reviewer",
      actorOrgId: "org-1",
      actorAuthMethod: AuthMethod.EMAIL
    });

  test("refuses to approve a request reviewed in an external approval system", async () => {
    const { service, updateById } = createService();

    await expect(reviewAs(service, ApprovalStatus.APPROVED)).rejects.toThrow(
      externallyReviewedAccessRequestMessage("req-1")
    );
    expect(updateById).not.toHaveBeenCalled();
  });

  test("refuses to reject a request reviewed in an external approval system", async () => {
    const { service, updateById } = createService();

    await expect(reviewAs(service, ApprovalStatus.REJECTED)).rejects.toThrow(
      externallyReviewedAccessRequestMessage("req-1")
    );
    expect(updateById).not.toHaveBeenCalled();
  });

  test("refuses a local review when the policy now delegates approval, even without a delegated request", async () => {
    const { service, updateById } = createService({ delegated: null });

    await expect(reviewAs(service, ApprovalStatus.APPROVED)).rejects.toThrow(
      externallyReviewedAccessRequestMessage("req-1")
    );
    expect(updateById).not.toHaveBeenCalled();
  });
});
