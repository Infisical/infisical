import { describe, expect, it, vi } from "vitest";

import { TApprovalRequests } from "@app/db/schemas";
import { ForbiddenRequestError } from "@app/lib/errors";
import { ActorType } from "@app/services/auth/auth-type";

import { ApprovalPolicyScope, ApprovalPolicyType, ApprovalRequestStatus, ApproverType } from "./approval-policy-enums";
import { approvalPolicyServiceFactory } from "./approval-policy-service";
import { certRevocationApprovalResourceFactory } from "./cert-revocation";

vi.mock("@app/lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));

type TDeps = Parameters<typeof approvalPolicyServiceFactory>[0];

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
