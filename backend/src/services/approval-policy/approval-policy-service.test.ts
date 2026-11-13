import { describe, expect, it, vi } from "vitest";

import { TApprovalRequests } from "@app/db/schemas";
import { ForbiddenRequestError } from "@app/lib/errors";
import { ActorType } from "@app/services/auth/auth-type";

import { ApprovalPolicyScope, ApprovalPolicyType, ApprovalRequestStatus, ApproverType } from "./approval-policy-enums";
import { approvalPolicyServiceFactory } from "./approval-policy-service";
import { certRevocationApprovalResourceFactory } from "./cert-revocation";

vi.mock("@app/lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));

type TDeps = Parameters<typeof approvalPolicyServiceFactory>[0];
type TStoredRequest = Pick<TApprovalRequests, "id" | "type" | "status">;
type TRequestFilter = { $in?: { id?: string[] }; type?: string; status?: string };

const buildService = (requests: TStoredRequest[]) => {
  const store = new Map(requests.map((request) => [request.id, { ...request }]));
  const approvalRequestDAL = {
    update: vi.fn().mockImplementation(async (filter: TRequestFilter, data: Partial<TStoredRequest>) => {
      const matched = [...store.values()].filter(
        (request) =>
          (!filter.$in?.id || filter.$in.id.includes(request.id)) &&
          (!filter.type || request.type === filter.type) &&
          (!filter.status || request.status === filter.status)
      );
      return matched.map((request) => {
        const updated = { ...request, ...data };
        store.set(request.id, updated);
        return updated;
      });
    })
  };
  const certRequestResource = { postRejectionRoutine: vi.fn().mockResolvedValue(undefined) };
  const revocationResource = { postRejectionRoutine: vi.fn().mockResolvedValue(undefined) };

  const service = approvalPolicyServiceFactory({
    approvalRequestDAL,
    resources: {
      [ApprovalPolicyType.CertRequest]: certRequestResource,
      [ApprovalPolicyType.CertRevocation]: revocationResource
    }
  } as unknown as TDeps);

  return { service, certRequestResource, revocationResource, statusOf: (id: string) => store.get(id)?.status };
};

describe("approvalPolicyService.notifyApprovedActionFailed", () => {
  const request = {
    id: "revocation-1",
    type: ApprovalPolicyType.CertRevocation,
    organizationId: "org-1",
    requesterId: "requester"
  } as TApprovalRequests;

  const buildNotifyingService = () => {
    const notificationService = { createUserNotifications: vi.fn().mockResolvedValue(undefined) };
    const approvalRequestDAL = {
      findStepsByRequestId: vi
        .fn()
        .mockResolvedValue([
          { approvers: [{ type: ApproverType.User, id: "approver-1" }] },
          { approvers: [{ type: ApproverType.User, id: "approver-2" }] }
        ])
    };
    const revocationResource = {
      buildNotification: vi.fn().mockImplementation(async ({ failureReason }: { failureReason?: string }) => ({
        inApp: { type: "approved-action-failed", title: "Revocation Failed", body: failureReason }
      }))
    };
    const service = approvalPolicyServiceFactory({
      approvalRequestDAL,
      notificationService,
      userGroupMembershipDAL: { find: vi.fn().mockResolvedValue([]) },
      resources: { [ApprovalPolicyType.CertRevocation]: revocationResource }
    } as unknown as TDeps);
    const notified = () =>
      notificationService.createUserNotifications.mock.calls.flatMap(([rows]) =>
        (rows as { userId: string; body: string }[]).map(({ userId, body }) => ({ userId, body }))
      );
    return { service, approvalRequestDAL, notified };
  };

  it("tells the requester and every step's approvers why the approved action failed", async () => {
    const ctx = buildNotifyingService();

    await ctx.service.notifyApprovedActionFailed(request, "AWS PCA timed out");

    expect(ctx.notified().sort((a, b) => a.userId.localeCompare(b.userId))).toEqual([
      { userId: "approver-1", body: "AWS PCA timed out" },
      { userId: "approver-2", body: "AWS PCA timed out" },
      { userId: "requester", body: "AWS PCA timed out" }
    ]);
  });

  it("doesn't throw when the approvers can't be loaded", async () => {
    const ctx = buildNotifyingService();
    ctx.approvalRequestDAL.findStepsByRequestId.mockRejectedValue(new Error("connection terminated"));

    await expect(ctx.service.notifyApprovedActionFailed(request, "AWS PCA timed out")).resolves.toBeUndefined();
  });
});

describe("approvalPolicyService review of a revocation by an approver removed from its Application", () => {
  const approver = { type: ActorType.USER, id: "approver-1", orgId: "org-1", authMethod: null } as never;

  const buildReviewingService = (applicationMemberships: unknown[]) => {
    const request = {
      id: "revocation-1",
      type: ApprovalPolicyType.CertRevocation,
      projectId: "project-1",
      organizationId: "org-1",
      status: ApprovalRequestStatus.Pending,
      currentStep: 1,
      scopeType: ApprovalPolicyScope.PkiApplication,
      scopeId: "app-1"
    };
    const approvalRequestDAL = {
      findById: vi.fn().mockResolvedValue(request),
      findStepsByRequestId: vi
        .fn()
        .mockResolvedValue([
          { stepNumber: 1, approvers: [{ type: ApproverType.User, id: "approver-1" }], approvals: [] }
        ]),
      transaction: vi.fn().mockRejectedValue(new Error("reached the decision"))
    };
    const certificateService = { revokeApprovedCertificate: vi.fn() };
    const revocationResource = certRevocationApprovalResourceFactory({
      approvalPolicyDAL: { findByProjectId: vi.fn() },
      certificateService,
      membershipDAL: { find: vi.fn().mockResolvedValue(applicationMemberships) }
    } as never);
    const service = approvalPolicyServiceFactory({
      approvalRequestDAL,
      permissionService: { getOrgPermission: vi.fn().mockResolvedValue({}) },
      userGroupMembershipDAL: { findGroupMembershipsByUserIdInOrg: vi.fn().mockResolvedValue([]) },
      resources: { [ApprovalPolicyType.CertRevocation]: revocationResource }
    } as unknown as TDeps);
    return { service, approvalRequestDAL, certificateService };
  };

  it("refuses the approval and leaves the certificate alone", async () => {
    const ctx = buildReviewingService([{ actorUserId: "someone-else", isActive: true }]);

    await expect(
      ctx.service.approveRequest("revocation-1", {}, approver, ApprovalPolicyType.CertRevocation)
    ).rejects.toBeInstanceOf(ForbiddenRequestError);
    expect(ctx.approvalRequestDAL.transaction).not.toHaveBeenCalled();
    expect(ctx.certificateService.revokeApprovedCertificate).not.toHaveBeenCalled();
  });

  it("refuses the rejection", async () => {
    const ctx = buildReviewingService([]);

    await expect(
      ctx.service.rejectRequest("revocation-1", {}, approver, ApprovalPolicyType.CertRevocation)
    ).rejects.toBeInstanceOf(ForbiddenRequestError);
    expect(ctx.approvalRequestDAL.transaction).not.toHaveBeenCalled();
  });

  it("lets a current member of the Application go on to record the decision", async () => {
    const ctx = buildReviewingService([{ actorUserId: "approver-1", isActive: true }]);

    await expect(
      ctx.service.approveRequest("revocation-1", {}, approver, ApprovalPolicyType.CertRevocation)
    ).rejects.toThrow("reached the decision");
  });
});

describe("approvalPolicyService.cancelPendingRequests", () => {
  it("cancels the named pending requests of the type and runs each one's rejection routine", async () => {
    const ctx = buildService([
      { id: "renewal-1", type: ApprovalPolicyType.CertRequest, status: ApprovalRequestStatus.Pending },
      { id: "renewal-2", type: ApprovalPolicyType.CertRequest, status: ApprovalRequestStatus.Pending },
      { id: "renewal-3", type: ApprovalPolicyType.CertRequest, status: ApprovalRequestStatus.Pending }
    ]);

    const cancelled = await ctx.service.cancelPendingRequests(ApprovalPolicyType.CertRequest, [
      "renewal-1",
      "renewal-2"
    ]);

    expect(cancelled.map((request) => request.id).sort()).toEqual(["renewal-1", "renewal-2"]);
    expect(ctx.statusOf("renewal-1")).toBe(ApprovalRequestStatus.Cancelled);
    expect(ctx.statusOf("renewal-2")).toBe(ApprovalRequestStatus.Cancelled);
    expect(ctx.statusOf("renewal-3")).toBe(ApprovalRequestStatus.Pending);
    expect(ctx.certRequestResource.postRejectionRoutine).toHaveBeenCalledTimes(2);
    expect(ctx.certRequestResource.postRejectionRoutine).toHaveBeenCalledWith(
      expect.objectContaining({ id: "renewal-1", status: ApprovalRequestStatus.Cancelled })
    );
  });

  it("leaves requests that were already decided or belong to another type alone", async () => {
    const ctx = buildService([
      { id: "renewal-approved", type: ApprovalPolicyType.CertRequest, status: ApprovalRequestStatus.Approved },
      { id: "revocation-1", type: ApprovalPolicyType.CertRevocation, status: ApprovalRequestStatus.Pending }
    ]);

    const cancelled = await ctx.service.cancelPendingRequests(ApprovalPolicyType.CertRequest, [
      "renewal-approved",
      "revocation-1"
    ]);

    expect(cancelled).toEqual([]);
    expect(ctx.statusOf("renewal-approved")).toBe(ApprovalRequestStatus.Approved);
    expect(ctx.statusOf("revocation-1")).toBe(ApprovalRequestStatus.Pending);
    expect(ctx.certRequestResource.postRejectionRoutine).not.toHaveBeenCalled();
    expect(ctx.revocationResource.postRejectionRoutine).not.toHaveBeenCalled();
  });

  it("still cancels every request when one rejection routine fails", async () => {
    const ctx = buildService([
      { id: "renewal-1", type: ApprovalPolicyType.CertRequest, status: ApprovalRequestStatus.Pending },
      { id: "renewal-2", type: ApprovalPolicyType.CertRequest, status: ApprovalRequestStatus.Pending }
    ]);
    ctx.certRequestResource.postRejectionRoutine.mockRejectedValueOnce(new Error("connection terminated"));

    const cancelled = await ctx.service.cancelPendingRequests(ApprovalPolicyType.CertRequest, [
      "renewal-1",
      "renewal-2"
    ]);

    expect(cancelled).toHaveLength(2);
    expect(ctx.certRequestResource.postRejectionRoutine).toHaveBeenCalledTimes(2);
  });
});
