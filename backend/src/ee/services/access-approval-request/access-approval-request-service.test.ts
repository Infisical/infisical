import { createMongoAbility, ForbiddenError } from "@casl/ability";
import { describe, expect, test, vi } from "vitest";

import { ProjectMembershipRole } from "@app/db/schemas";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { ForbiddenRequestError } from "@app/lib/errors";
import { ApprovalRequestStatus } from "@app/services/approval-policy/approval-policy-enums";
import { ActorType, AuthMethod } from "@app/services/auth/auth-type";
import { DelegatedApprovalRequestStatus } from "@app/services/delegated-approval/delegated-approval-enums";

import { externallyReviewedAccessRequestMessage } from "./access-approval-request-constants";
import { secretAccessApprovalRequestServiceFactory } from "./access-approval-request-service";
import { ApprovalStatus } from "./access-approval-request-types";

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({ SITE_URL: "https://example.com" })
}));

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
  permission = cannotEditPolicies,
  memberships = [] as { roles: { role: string }[] }[],
  projectAccess = "member" as "member" | "none"
} = {}) => {
  let current = { ...pendingRequest };
  const updateById = vi.fn().mockImplementation(async (_id: string, patch: Partial<typeof pendingRequest>) => {
    current = { ...current, ...patch };
    return current;
  });
  const findSecretAccessPolicies = vi.fn().mockResolvedValue(policy ? [policy] : []);
  const getProjectPermission =
    projectAccess === "member"
      ? vi.fn().mockResolvedValue({ permission, memberships })
      : vi
          .fn()
          .mockRejectedValue(
            new ForbiddenRequestError({ message: "You are not a member of this project with ID project-1" })
          );

  const service = secretAccessApprovalRequestServiceFactory({
    secretAccessApprovalRequestDAL: {
      findSecretAccessRequestById: vi.fn().mockImplementation(async () => current)
    },
    secretAccessApprovalPolicyDAL: { findSecretAccessPolicies },
    permissionService: { getProjectPermission },
    delegatedApprovalService: { getRequestByRequestId: vi.fn().mockResolvedValue(delegated) },
    approvalRequestDAL: {
      transaction: vi.fn().mockImplementation(async (cb: (tx: string) => unknown) => cb("tx")),
      findByIdForUpdate: vi.fn().mockResolvedValue(lockedRequest),
      updateById
    }
  } as never);

  return { service, updateById, findSecretAccessPolicies };
};

const cancelAs = (service: ReturnType<typeof createService>["service"], actorId: string) =>
  service.cancelAccessRequest({
    requestId: "req-1",
    actor: ActorType.USER,
    actorId,
    actorOrgId: "org-1",
    actorAuthMethod: AuthMethod.EMAIL
  });

describe("secretAccessApprovalRequestService.cancelAccessRequest", () => {
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

describe("secretAccessApprovalRequestService.reviewAccessRequest", () => {
  const reviewAs = (service: ReturnType<typeof createService>["service"], status: ApprovalStatus) =>
    service.reviewAccessRequest({
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

  test("answers a non-member with the membership refusal, not the external review message", async () => {
    const { service, findSecretAccessPolicies } = createService({ projectAccess: "none" });

    await expect(reviewAs(service, ApprovalStatus.APPROVED)).rejects.toThrow(
      "You are not a member of this project with ID project-1"
    );
    expect(findSecretAccessPolicies).not.toHaveBeenCalled();
  });

  test("refuses a member whose only active role is NoAccess before reading the policy", async () => {
    const { service, findSecretAccessPolicies } = createService({
      memberships: [{ roles: [{ role: ProjectMembershipRole.NoAccess }] }]
    });

    await expect(reviewAs(service, ApprovalStatus.APPROVED)).rejects.toThrow(
      "You are not authorized to review this request"
    );
    expect(findSecretAccessPolicies).not.toHaveBeenCalled();
  });
});

const REQUEST_PERMISSIONS = [["read", "secrets", { environment: "dev", secretPath: { $glob: "/app" } }]];

const snapshotPolicy = {
  id: "policy-1",
  name: "Prod access",
  enforcementLevel: "hard",
  updatedAt: new Date("2026-10-28T10:00:00.000Z"),
  constraints: {
    version: 1 as const,
    constraints: {
      allowedSelfApprovals: true,
      requestExpirationTime: "1h",
      maxTimePeriod: null
    }
  }
};

const createRequestService = ({ lockedUpdatedAt = snapshotPolicy.updatedAt } = {}) => {
  const findByIdForShare = vi.fn().mockResolvedValue({ id: "policy-1", updatedAt: lockedUpdatedAt });
  const create = vi.fn().mockResolvedValue({ id: "req-1" });
  const createRequest = vi.fn().mockResolvedValue({ id: "delegated-1" });

  const service = secretAccessApprovalRequestServiceFactory({
    approvalRequestDAL: {
      transaction: async (callback: (tx: string) => Promise<unknown>) => callback("tx"),
      create
    },
    approvalRequestStepsDAL: {},
    approvalRequestStepEligibleApproversDAL: {},
    approvalPolicyDAL: {
      findByIdForShare,
      findStepsByPolicyId: vi.fn().mockResolvedValue([])
    },
    delegatedApprovalService: {
      getPolicyByPolicyId: vi.fn().mockResolvedValue({ policyId: "policy-1" }),
      createRequest
    },
    secretAccessApprovalGlobalResource: {
      matchPolicy: vi.fn().mockResolvedValue(snapshotPolicy),
      validateConstraints: vi.fn().mockReturnValue({ valid: true }),
      canAccess: vi.fn().mockResolvedValue(null)
    },
    secretAccessApprovalRequestDAL: {
      findPendingRequests: vi.fn().mockResolvedValue([]),
      findSecretAccessRequestById: vi.fn().mockResolvedValue(pendingRequest)
    },
    userDAL: {
      findById: vi.fn().mockResolvedValue({
        id: "requester",
        firstName: "Ada",
        lastName: "Lovelace",
        username: "ada",
        email: "ada@example.com"
      })
    },
    projectDAL: {
      findProjectBySlug: vi.fn().mockResolvedValue({ id: "project-1", name: "Project", orgId: "org-1" }),
      checkProjectUpgradeStatus: vi.fn().mockResolvedValue(undefined)
    },
    projectEnvDAL: { findOne: vi.fn().mockResolvedValue({ id: "env-1", slug: "dev", name: "Development" }) },
    permissionService: { getProjectPermission: vi.fn().mockResolvedValue({ permission: canEditPolicies }) },
    queueService: { queue: vi.fn().mockResolvedValue(undefined) },
    licenseService: { getPlan: vi.fn().mockResolvedValue({ secretApproval: true }) }
  } as never);

  return { service, findByIdForShare, create, createRequest };
};

const submitAccessRequest = (
  service: ReturnType<typeof createRequestService>["service"],
  overrides: Record<string, unknown> = {}
) =>
  service.createAccessApprovalRequest({
    projectSlug: "project",
    actor: ActorType.USER,
    actorId: "requester",
    actorOrgId: "org-1",
    actorAuthMethod: AuthMethod.EMAIL,
    permissions: REQUEST_PERMISSIONS,
    isTemporary: false,
    ...overrides
  } as Parameters<ReturnType<typeof createRequestService>["service"]["createAccessApprovalRequest"]>[0]);

describe("secretAccessApprovalRequestService.createAccessApprovalRequest", () => {
  test("creates a delegated request while holding the lock on the unchanged policy", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-28T12:00:00.000Z"));
    const { service, findByIdForShare, create, createRequest } = createRequestService({
      lockedUpdatedAt: new Date(snapshotPolicy.updatedAt.getTime())
    });

    try {
      await submitAccessRequest(service);

      expect(findByIdForShare).toHaveBeenCalledWith("policy-1", "tx");
      expect(findByIdForShare.mock.invocationCallOrder[0]).toBeLessThan(create.mock.invocationCallOrder[0]);
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ expiresAt: new Date("2026-10-28T13:00:00.000Z") }),
        "tx"
      );
      expect(findByIdForShare.mock.invocationCallOrder[0]).toBeLessThan(createRequest.mock.invocationCallOrder[0]);
      expect(createRequest).toHaveBeenCalledTimes(1);
      expect(createRequest.mock.calls[0][1]).toBe("tx");
      expect(createRequest.mock.calls[0][0]).toMatchObject({ approvalRequest: { id: "req-1" } });
    } finally {
      vi.useRealTimers();
    }
  });

  test("refuses when the policy was updated after the request matched it", async () => {
    const { service, create, createRequest } = createRequestService({
      lockedUpdatedAt: new Date("2026-10-28T10:05:00.000Z")
    });

    await expect(submitAccessRequest(service)).rejects.toThrow(
      "Policy 'Prod access' was changed while the request was being created. Submit the request again."
    );
    expect(create).not.toHaveBeenCalled();
    expect(createRequest).not.toHaveBeenCalled();
  });
});
