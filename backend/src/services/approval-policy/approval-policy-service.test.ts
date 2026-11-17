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

  type TApplicationMembership = { actorUserId?: string; actorGroupId?: string; isActive: boolean; role?: string };

  const buildReviewingService = (
    applicationMemberships: TApplicationMembership[],
    {
      type = ApprovalPolicyType.CertRevocation,
      status = ApprovalRequestStatus.Pending,
      expiresAt = null,
      steps = [{ stepNumber: 1, approvers: [{ type: ApproverType.User, id: "approver-1" }], approvals: [] }],
      replicaMemberships = applicationMemberships,
      groupIds = [],
      replicaGroupIds = groupIds
    }: {
      type?: ApprovalPolicyType;
      status?: ApprovalRequestStatus;
      expiresAt?: Date | null;
      steps?: { stepNumber: number; approvers: { type: ApproverType; id: string }[]; approvals: unknown[] }[];
      replicaMemberships?: TApplicationMembership[];
      groupIds?: string[];
      replicaGroupIds?: string[];
    } = {}
  ) => {
    const primaryDb = { node: "primary" };
    const fromNode = <T>(db: unknown, primary: T, replica: T) => (db === primaryDb ? primary : replica);
    const memberships = applicationMemberships.map((m, i) => ({ ...m, id: `membership-${i}` }));
    const replicaMembershipRows = replicaMemberships.map((m, i) => ({ ...m, id: `membership-${i}` }));
    const request = {
      id: "revocation-1",
      type,
      projectId: "project-1",
      organizationId: "org-1",
      status,
      expiresAt,
      currentStep: 1,
      scopeType: ApprovalPolicyScope.PkiApplication,
      scopeId: "app-1"
    };
    const approvalRequestDAL = {
      findById: vi.fn().mockResolvedValue(request),
      findStepsByRequestId: vi.fn().mockResolvedValue(steps),
      transaction: vi.fn().mockRejectedValue(new Error("reached the decision"))
    };
    const certificateService = { revokeApprovedCertificate: vi.fn() };
    const approvalPolicyDAL = { findByProjectId: vi.fn(), primaryNode: vi.fn().mockReturnValue(primaryDb) };
    const userGroupMembershipDAL = {
      findGroupMembershipsByUserIdInOrg: vi.fn(async (_userId: string, _orgId: string, db?: unknown) =>
        fromNode(db, groupIds, replicaGroupIds).map((groupId) => ({ groupId }))
      )
    };
    const revocationResource = certRevocationApprovalResourceFactory({
      approvalPolicyDAL,
      certificateService,
      membershipDAL: {
        find: vi.fn(async (_filter: unknown, opts?: { tx?: unknown }) =>
          fromNode(opts?.tx, memberships, replicaMembershipRows)
        )
      },
      membershipRoleDAL: {
        find: vi.fn(async (_filter: unknown, opts?: { tx?: unknown }) =>
          fromNode(opts?.tx, memberships, replicaMembershipRows).map((m) => ({
            membershipId: m.id,
            role: m.role ?? "operator"
          }))
        )
      },
      userGroupMembershipDAL: { find: vi.fn().mockResolvedValue([]) }
    } as never);
    const service = approvalPolicyServiceFactory({
      approvalRequestDAL,
      approvalPolicyDAL,
      permissionService: {
        getOrgPermission: vi.fn().mockResolvedValue({}),
        getResourcePermission: vi.fn().mockResolvedValue({ permission: { can: () => true } })
      },
      userGroupMembershipDAL,
      resources: { [ApprovalPolicyType.CertRevocation]: revocationResource }
    } as unknown as TDeps);
    return { service, approvalRequestDAL, certificateService, userGroupMembershipDAL, primaryDb };
  };

  it("refuses the approval and leaves the certificate alone", async () => {
    const ctx = buildReviewingService([{ actorUserId: "someone-else", isActive: true }]);

    await expect(
      ctx.service.approveRequest("revocation-1", {}, approver, ApprovalPolicyType.CertRevocation)
    ).rejects.toBeInstanceOf(ForbiddenRequestError);
    expect(ctx.approvalRequestDAL.transaction).not.toHaveBeenCalled();
    expect(ctx.certificateService.revokeApprovedCertificate).not.toHaveBeenCalled();
    expect(ctx.userGroupMembershipDAL.findGroupMembershipsByUserIdInOrg).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      ctx.primaryDb
    );
  });

  it("refuses the rejection", async () => {
    const ctx = buildReviewingService([]);

    await expect(
      ctx.service.rejectRequest("revocation-1", {}, approver, ApprovalPolicyType.CertRevocation)
    ).rejects.toBeInstanceOf(ForbiddenRequestError);
    expect(ctx.approvalRequestDAL.transaction).not.toHaveBeenCalled();
    expect(ctx.userGroupMembershipDAL.findGroupMembershipsByUserIdInOrg).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      ctx.primaryDb
    );
  });

  it("lets a current member of the Application go on to record the decision", async () => {
    const ctx = buildReviewingService([{ actorUserId: "approver-1", isActive: true }]);

    await expect(
      ctx.service.approveRequest("revocation-1", {}, approver, ApprovalPolicyType.CertRevocation)
    ).rejects.toThrow("reached the decision");
  });

  it.each([
    ["approval", "approveRequest"],
    ["rejection", "rejectRequest"]
  ] as const)("refuses the %s from an approver demoted to Auditor", async (_label, method) => {
    const ctx = buildReviewingService([{ actorUserId: "approver-1", isActive: true, role: "auditor" }]);

    await expect(ctx.service[method]("revocation-1", {}, approver, ApprovalPolicyType.CertRevocation)).rejects.toThrow(
      "You can't review this request because you no longer have a role in its Application that can approve requests."
    );
    expect(ctx.approvalRequestDAL.transaction).not.toHaveBeenCalled();
    expect(ctx.certificateService.revokeApprovedCertificate).not.toHaveBeenCalled();
  });

  it.each([
    ["still holds an approving role", [{ actorUserId: "approver-1", isActive: true, role: "operator" }], true],
    ["was demoted to Auditor", [{ actorUserId: "approver-1", isActive: true, role: "auditor" }], false],
    ["was removed from the Application", [{ actorUserId: "someone-else", isActive: true }], false],
    ["has a deactivated membership", [{ actorUserId: "approver-1", isActive: false }], false]
  ] as const)("tells a saved approver who %s whether they can review it", async (_label, memberships, expected) => {
    const ctx = buildReviewingService([...memberships]);

    const result = await ctx.service.getRequestById("revocation-1", approver);

    expect(result.canReview).toBe(expected);
  });

  it.each([
    ["holds an approving role through a group", "operator", true],
    ["holds only Auditor through a group", "auditor", false]
  ] as const)("tells a saved group approver who %s whether they can review it", async (_label, role, expected) => {
    const ctx = buildReviewingService([{ actorGroupId: "group-1", isActive: true, role }], {
      steps: [{ stepNumber: 1, approvers: [{ type: ApproverType.Group, id: "group-1" }], approvals: [] }],
      groupIds: ["group-1"]
    });

    const result = await ctx.service.getRequestById("revocation-1", approver);

    expect(result.canReview).toBe(expected);
  });

  it("lets an approver whose regained role a lagging replica hasn't seen review, as approving would", async () => {
    const ctx = buildReviewingService([{ actorUserId: "approver-1", isActive: true, role: "operator" }], {
      replicaMemberships: [{ actorUserId: "approver-1", isActive: true, role: "auditor" }]
    });

    const result = await ctx.service.getRequestById("revocation-1", approver);

    expect(result.canReview).toBe(true);
  });

  it("lets a group approver whose group link a lagging replica hasn't seen review, as approving would", async () => {
    const ctx = buildReviewingService([{ actorGroupId: "group-1", isActive: true }], {
      steps: [{ stepNumber: 1, approvers: [{ type: ApproverType.Group, id: "group-1" }], approvals: [] }],
      groupIds: ["group-1"],
      replicaGroupIds: []
    });

    const result = await ctx.service.getRequestById("revocation-1", approver);

    expect(result.canReview).toBe(true);
  });

  it("doesn't let an approver named only on a later step review while an earlier step is in progress", async () => {
    const ctx = buildReviewingService([{ actorUserId: "approver-1", isActive: true }], {
      steps: [
        { stepNumber: 1, approvers: [{ type: ApproverType.User, id: "approver-2" }], approvals: [] },
        { stepNumber: 2, approvers: [{ type: ApproverType.User, id: "approver-1" }], approvals: [] }
      ]
    });

    const result = await ctx.service.getRequestById("revocation-1", approver);

    expect(result.canReview).toBe(false);
  });

  it("doesn't let a caller named on no step review", async () => {
    const ctx = buildReviewingService([{ actorUserId: "approver-1", isActive: true }], {
      steps: [{ stepNumber: 1, approvers: [{ type: ApproverType.User, id: "approver-2" }], approvals: [] }]
    });

    const result = await ctx.service.getRequestById("revocation-1", approver);

    expect(result.canReview).toBe(false);
  });

  it("doesn't let an approver review a request that's no longer pending", async () => {
    const ctx = buildReviewingService([{ actorUserId: "approver-1", isActive: true }], {
      status: ApprovalRequestStatus.Approved
    });

    const result = await ctx.service.getRequestById("revocation-1", approver);

    expect(result.canReview).toBe(false);
  });

  it("doesn't let an approver review a pending request that has expired before the sweep closes it", async () => {
    const ctx = buildReviewingService([{ actorUserId: "approver-1", isActive: true }], {
      expiresAt: new Date(Date.now() - 60_000)
    });

    const result = await ctx.service.getRequestById("revocation-1", approver);

    expect(result.canReview).toBe(false);
  });

  it("lets a saved approver review a request type with no current access check", async () => {
    const ctx = buildReviewingService([], { type: ApprovalPolicyType.CertRequest });

    const result = await ctx.service.getRequestById("revocation-1", approver);

    expect(result.canReview).toBe(true);
  });
});
