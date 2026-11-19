import { describe, expect, it, vi } from "vitest";

import { OrgMembershipStatus, ResourceMembershipRole, TApprovalRequests } from "@app/db/schemas";
import { ForbiddenRequestError } from "@app/lib/errors";
import { isScopeNarrowedRequest } from "@app/lib/request-context/oauth-delegation";
import { ActorType } from "@app/services/auth/auth-type";

import { ApprovalPolicyScope, ApprovalPolicyType, ApprovalRequestStatus, ApproverType } from "./approval-policy-enums";
import { approvalPolicyServiceFactory } from "./approval-policy-service";
import { certRevocationApprovalResourceFactory } from "./cert-revocation";

vi.mock("@app/lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));
vi.mock("@app/lib/request-context/oauth-delegation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/lib/request-context/oauth-delegation")>()),
  isScopeNarrowedRequest: vi.fn().mockReturnValue(false)
}));

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
      find: vi.fn().mockResolvedValue([request]),
      findStepsByRequestIds: vi.fn().mockResolvedValue({ [request.id]: steps }),
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
      userGroupMembershipDAL: { find: vi.fn().mockResolvedValue([]) },
      orgDAL: {
        findMembership: vi.fn().mockResolvedValue([]),
        findActorsWithActiveOrgAccess: vi.fn(),
        findById: vi.fn().mockResolvedValue({ id: "org-1", rootOrgId: null })
      },
      userDAL: { find: vi.fn().mockResolvedValue([]) }
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

    expect(result.request.canReview).toBe(expected);
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

    expect(result.request.canReview).toBe(expected);
  });

  it("lets an approver whose regained role a lagging replica hasn't seen review, as approving would", async () => {
    const ctx = buildReviewingService([{ actorUserId: "approver-1", isActive: true, role: "operator" }], {
      replicaMemberships: [{ actorUserId: "approver-1", isActive: true, role: "auditor" }]
    });

    const result = await ctx.service.getRequestById("revocation-1", approver);

    expect(result.request.canReview).toBe(true);
  });

  it("lets a group approver whose group link a lagging replica hasn't seen review, as approving would", async () => {
    const ctx = buildReviewingService([{ actorGroupId: "group-1", isActive: true }], {
      steps: [{ stepNumber: 1, approvers: [{ type: ApproverType.Group, id: "group-1" }], approvals: [] }],
      groupIds: ["group-1"],
      replicaGroupIds: []
    });

    const result = await ctx.service.getRequestById("revocation-1", approver);

    expect(result.request.canReview).toBe(true);
  });

  it("doesn't let an approver named only on a later step review while an earlier step is in progress", async () => {
    const ctx = buildReviewingService([{ actorUserId: "approver-1", isActive: true }], {
      steps: [
        { stepNumber: 1, approvers: [{ type: ApproverType.User, id: "approver-2" }], approvals: [] },
        { stepNumber: 2, approvers: [{ type: ApproverType.User, id: "approver-1" }], approvals: [] }
      ]
    });

    const result = await ctx.service.getRequestById("revocation-1", approver);

    expect(result.request.canReview).toBe(false);
    for (const decide of [ctx.service.approveRequest, ctx.service.rejectRequest]) {
      // eslint-disable-next-line no-await-in-loop
      await expect(decide("revocation-1", {}, approver, ApprovalPolicyType.CertRevocation)).rejects.toThrow(
        "You are not an eligible approver for this step"
      );
    }
  });

  it("doesn't let a caller named on no step review", async () => {
    const ctx = buildReviewingService([{ actorUserId: "approver-1", isActive: true }], {
      steps: [{ stepNumber: 1, approvers: [{ type: ApproverType.User, id: "approver-2" }], approvals: [] }]
    });

    const result = await ctx.service.getRequestById("revocation-1", approver);

    expect(result.request.canReview).toBe(false);
  });

  it("doesn't let an approver review a request that's no longer pending", async () => {
    const ctx = buildReviewingService([{ actorUserId: "approver-1", isActive: true }], {
      status: ApprovalRequestStatus.Approved
    });

    const result = await ctx.service.getRequestById("revocation-1", approver);

    expect(result.request.canReview).toBe(false);
  });

  it("doesn't let an approver review a pending request that has expired before the sweep closes it", async () => {
    const ctx = buildReviewingService([{ actorUserId: "approver-1", isActive: true }], {
      expiresAt: new Date(Date.now() - 60_000)
    });

    const result = await ctx.service.getRequestById("revocation-1", approver);

    expect(result.request.canReview).toBe(false);
  });

  it("lets a saved approver review a request type with no current access check", async () => {
    const ctx = buildReviewingService([], { type: ApprovalPolicyType.CertRequest });

    const result = await ctx.service.getRequestById("revocation-1", approver);

    expect(result.request.canReview).toBe(true);
  });

  it("doesn't let an OAuth application with scoped access review, since approving and rejecting refuse it", async () => {
    const ctx = buildReviewingService([{ actorUserId: "approver-1", isActive: true, role: "operator" }]);
    vi.mocked(isScopeNarrowedRequest).mockReturnValue(true);
    try {
      const result = await ctx.service.getRequestById("revocation-1", approver);

      expect(result.request.canReview).toBe(false);
      for (const decide of [ctx.service.approveRequest, ctx.service.rejectRequest]) {
        // eslint-disable-next-line no-await-in-loop
        await expect(decide("revocation-1", {}, approver, ApprovalPolicyType.CertRevocation)).rejects.toThrow(
          "An OAuth application with scoped access cannot approve, reject, or bypass approval requests."
        );
      }
    } finally {
      vi.mocked(isScopeNarrowedRequest).mockReturnValue(false);
    }
  });
});

describe("approvalPolicyService rechecks a revocation approver under the request's lock", () => {
  const approver = { type: ActorType.USER, id: "approver-1", orgId: "org-1", authMethod: null } as never;
  const groupMessage =
    "You can't review this request because the group that names you as an approver no longer has a role in its Application that can approve requests.";

  type TMembership = { actorUserId?: string; actorGroupId?: string; role?: string };

  // Step 1 names the actor directly and step 2 only through group-1. The check before the transaction sees step 1;
  // under the lock a concurrent approval has moved the request to step 2, and what the transaction reads is `inTx`.
  const build = ({ inTx, groupIdsInTx }: { inTx: TMembership[]; groupIdsInTx: string[] }) => {
    const primaryDb = { node: "primary" };
    const tx = { node: "tx" };
    const before: TMembership[] = [{ actorUserId: "approver-1" }, { actorGroupId: "group-1" }];
    const rows = (db: unknown) => (db === tx ? inTx : before).map((m, i) => ({ ...m, isActive: true, id: `m-${i}` }));
    const steps = [
      { id: "step-1", stepNumber: 1, approvers: [{ type: ApproverType.User, id: "approver-1" }], approvals: [] },
      { id: "step-2", stepNumber: 2, approvers: [{ type: ApproverType.Group, id: "group-1" }], approvals: [] }
    ];
    const request = {
      id: "revocation-1",
      type: ApprovalPolicyType.CertRevocation,
      projectId: "project-1",
      organizationId: "org-1",
      status: ApprovalRequestStatus.Pending,
      expiresAt: null,
      currentStep: 1,
      scopeType: ApprovalPolicyScope.PkiApplication,
      scopeId: "app-1"
    };
    const approvalRequestDAL = {
      findById: vi.fn().mockResolvedValue(request),
      findStepsByRequestId: vi.fn().mockResolvedValue(steps),
      find: vi.fn().mockResolvedValue([request]),
      findStepsByRequestIds: vi.fn().mockResolvedValue({ [request.id]: steps }),
      findByIdForUpdate: vi.fn().mockResolvedValue({ ...request, currentStep: 2 }),
      transaction: vi.fn(async (fn: (t: unknown) => Promise<unknown>) => fn(tx))
    };
    const approvalRequestApprovalsDAL = {
      find: vi.fn().mockRejectedValue(new Error("reached the vote")),
      create: vi.fn().mockRejectedValue(new Error("reached the vote"))
    };
    const approvalPolicyDAL = { findByProjectId: vi.fn(), primaryNode: vi.fn().mockReturnValue(primaryDb) };
    const userGroupMembershipDAL = {
      findGroupMembershipsByUserIdInOrg: vi.fn(async (_u: string, _o: string, db?: unknown) =>
        (db === tx ? groupIdsInTx : ["group-1"]).map((groupId) => ({ groupId }))
      )
    };
    const membershipDAL = { find: vi.fn(async (_f: unknown, opts?: { tx?: unknown }) => rows(opts?.tx)) };
    const revocationResource = certRevocationApprovalResourceFactory({
      approvalPolicyDAL,
      certificateService: { revokeApprovedCertificate: vi.fn() },
      membershipDAL,
      membershipRoleDAL: {
        find: vi.fn(async (_f: unknown, opts?: { tx?: unknown }) =>
          rows(opts?.tx).map((m) => ({ membershipId: m.id, role: m.role ?? "operator" }))
        )
      },
      userGroupMembershipDAL: { find: vi.fn().mockResolvedValue([]) },
      orgDAL: {
        findMembership: vi.fn().mockResolvedValue([]),
        findActorsWithActiveOrgAccess: vi.fn(),
        findById: vi.fn().mockResolvedValue({ id: "org-1", rootOrgId: null })
      },
      userDAL: { find: vi.fn().mockResolvedValue([]) }
    } as never);
    const service = approvalPolicyServiceFactory({
      approvalRequestDAL,
      approvalRequestApprovalsDAL,
      approvalPolicyDAL,
      permissionService: {
        getOrgPermission: vi.fn().mockResolvedValue({}),
        getResourcePermission: vi.fn().mockResolvedValue({ permission: { can: () => true } })
      },
      userGroupMembershipDAL,
      resources: { [ApprovalPolicyType.CertRevocation]: revocationResource }
    } as unknown as TDeps);
    return { service, tx, approvalRequestApprovalsDAL, membershipDAL, userGroupMembershipDAL };
  };

  const decisions = [
    ["approval", "approveRequest"],
    ["rejection", "rejectRequest"]
  ] as const;

  it.each(decisions)(
    "refuses the %s once the step names them only through a group demoted to Auditor in the meantime",
    async (_label, method) => {
      const ctx = build({
        inTx: [{ actorUserId: "approver-1" }, { actorGroupId: "group-1", role: "auditor" }],
        groupIdsInTx: ["group-1"]
      });

      await expect(
        ctx.service[method]("revocation-1", {}, approver, ApprovalPolicyType.CertRevocation)
      ).rejects.toThrow(groupMessage);
      expect(ctx.approvalRequestApprovalsDAL.create).not.toHaveBeenCalled();
    }
  );

  it.each(decisions)(
    "refuses the %s once they left the group the step names in the meantime",
    async (_label, method) => {
      const ctx = build({ inTx: [{ actorUserId: "approver-1" }, { actorGroupId: "group-1" }], groupIdsInTx: [] });

      await expect(
        ctx.service[method]("revocation-1", {}, approver, ApprovalPolicyType.CertRevocation)
      ).rejects.toThrow("You are not an eligible approver for this step");
      expect(ctx.approvalRequestApprovalsDAL.create).not.toHaveBeenCalled();
    }
  );

  it.each(decisions)(
    "lets the %s through when the group still approves, reading memberships through the transaction",
    async (_label, method) => {
      const ctx = build({
        inTx: [{ actorUserId: "approver-1" }, { actorGroupId: "group-1" }],
        groupIdsInTx: ["group-1"]
      });

      await expect(
        ctx.service[method]("revocation-1", {}, approver, ApprovalPolicyType.CertRevocation)
      ).rejects.toThrow("reached the vote");
      expect(ctx.userGroupMembershipDAL.findGroupMembershipsByUserIdInOrg).toHaveBeenCalledWith(
        "approver-1",
        "org-1",
        ctx.tx
      );
      expect(ctx.membershipDAL.find).toHaveBeenCalledWith(expect.anything(), { tx: ctx.tx });
    }
  );
});

describe("approvalPolicyService flags a pending request its saved approvers can no longer approve", () => {
  const viewer = { type: ActorType.USER, id: "viewer-1", orgId: "org-1", authMethod: null } as never;

  const build = ({
    primaryRole,
    replicaRole,
    type = ApprovalPolicyType.CertRevocation,
    status = ApprovalRequestStatus.Pending,
    expiresAt = null,
    requestCount = 1
  }: {
    primaryRole: ResourceMembershipRole;
    replicaRole: ResourceMembershipRole;
    type?: ApprovalPolicyType;
    status?: ApprovalRequestStatus;
    expiresAt?: Date | null;
    requestCount?: number;
  }) => {
    const primaryDb = { node: "primary" };
    const membership = { id: "membership-1", actorUserId: "approver-1", isActive: true, scopeOrgId: "org-1" };
    const steps = [
      {
        stepNumber: 1,
        requiredApprovals: 1,
        approvers: [{ type: ApproverType.User, id: "approver-1" }],
        approvals: []
      }
    ];
    const request = {
      id: "revocation-1",
      type,
      projectId: "project-1",
      organizationId: "org-1",
      policyId: "policy-1",
      requesterId: "requester-1",
      status,
      expiresAt,
      currentStep: 1,
      scopeType: ApprovalPolicyScope.PkiApplication,
      scopeId: "app-1"
    };
    const approvalPolicyDAL = {
      find: vi.fn().mockResolvedValue([]),
      findBypassersByPolicyIds: vi.fn().mockResolvedValue({}),
      primaryNode: vi.fn().mockReturnValue(primaryDb)
    };
    const membershipDAL = { find: vi.fn().mockResolvedValue([membership]) };
    const revocationResource = certRevocationApprovalResourceFactory({
      approvalPolicyDAL,
      certificateService: { revokeApprovedCertificate: vi.fn() },
      membershipDAL,
      membershipRoleDAL: {
        find: vi.fn(async (_filter: unknown, opts?: { tx?: unknown }) => [
          { membershipId: membership.id, role: opts?.tx === primaryDb ? primaryRole : replicaRole }
        ])
      },
      userGroupMembershipDAL: { find: vi.fn().mockResolvedValue([]) },
      orgDAL: {
        findMembership: vi
          .fn()
          .mockResolvedValue([{ actorUserId: "approver-1", isActive: true, status: OrgMembershipStatus.Accepted }]),
        findActorsWithActiveOrgAccess: vi.fn(),
        findById: vi.fn().mockResolvedValue({ id: "org-1", rootOrgId: null })
      },
      userDAL: { find: vi.fn().mockResolvedValue([]) }
    } as never);
    const requests = Array.from({ length: requestCount }, (_, i) => ({ ...request, id: `revocation-${i + 1}` }));
    const approvalRequestDAL = {
      findById: vi.fn().mockResolvedValue(request),
      findStepsByRequestId: vi.fn().mockResolvedValue(steps),
      find: vi.fn(async (filter: { $in: { id: string[] } }) => requests.filter((r) => filter.$in.id.includes(r.id))),
      findStepsByRequestIds: vi.fn(async (ids: string[]) => Object.fromEntries(ids.map((id) => [id, steps]))),
      findByProjectId: vi.fn().mockResolvedValue(requests.map((r) => ({ ...r, steps })))
    };
    const service = approvalPolicyServiceFactory({
      approvalRequestDAL,
      approvalRequestGrantsDAL: { find: vi.fn().mockResolvedValue([]), findOne: vi.fn().mockResolvedValue(null) },
      approvalPolicyDAL,
      pkiApplicationDAL: { findById: vi.fn().mockResolvedValue({ id: "app-1", projectId: "project-1" }) },
      permissionService: {
        getOrgPermission: vi.fn().mockResolvedValue({}),
        getResourcePermission: vi.fn().mockResolvedValue({ permission: { can: () => true } })
      },
      userGroupMembershipDAL: { findGroupMembershipsByUserIdInOrg: vi.fn().mockResolvedValue([]) },
      resources: { [ApprovalPolicyType.CertRevocation]: revocationResource }
    } as unknown as TDeps);

    const flags = async () => {
      const { request: fetched } = await service.getRequestById("revocation-1", viewer);
      const { requests: listed } = await service.listRequests(
        type,
        ApprovalPolicyScope.PkiApplication,
        "app-1",
        viewer
      );
      return { fetched: fetched.approversCanNoLongerApprove, listed: listed[0].approversCanNoLongerApprove };
    };
    const listFlags = async () =>
      (await service.listRequests(type, ApprovalPolicyScope.PkiApplication, "app-1", viewer)).requests.map(
        (r) => r.approversCanNoLongerApprove
      );
    return { flags, listFlags, membershipDAL, approvalRequestDAL, primaryDb };
  };

  it("flags it once its only approver is demoted to Auditor, even while a replica still shows them as Operator", async () => {
    const ctx = build({ primaryRole: ResourceMembershipRole.Auditor, replicaRole: ResourceMembershipRole.Operator });

    expect(await ctx.flags()).toEqual({ fetched: true, listed: true });
  });

  it("doesn't flag it while its approver can still approve, even while a replica shows them demoted", async () => {
    const ctx = build({ primaryRole: ResourceMembershipRole.Operator, replicaRole: ResourceMembershipRole.Auditor });

    expect(await ctx.flags()).toEqual({ fetched: false, listed: false });
  });

  it("doesn't flag a pending request that has expired before the sweep closes it", async () => {
    const ctx = build({
      primaryRole: ResourceMembershipRole.Auditor,
      replicaRole: ResourceMembershipRole.Auditor,
      expiresAt: new Date(Date.now() - 60_000)
    });

    expect(await ctx.flags()).toEqual({ fetched: false, listed: false });
  });

  it.each([ApprovalRequestStatus.Approved, ApprovalRequestStatus.Rejected, ApprovalRequestStatus.Cancelled])(
    "doesn't flag a request that is %s",
    async (status) => {
      const ctx = build({
        primaryRole: ResourceMembershipRole.Auditor,
        replicaRole: ResourceMembershipRole.Auditor,
        status
      });

      expect(await ctx.flags()).toEqual({ fetched: false, listed: false });
    }
  );

  it("leaves the flag off request types whose saved approvers can't go stale", async () => {
    const ctx = build({
      primaryRole: ResourceMembershipRole.Auditor,
      replicaRole: ResourceMembershipRole.Auditor,
      type: ApprovalPolicyType.CertRequest
    });

    expect(await ctx.flags()).toEqual({ fetched: undefined, listed: undefined });
  });

  it("checks every pending request in an Application with one read of its requests, steps and approvers", async () => {
    const one = build({ primaryRole: ResourceMembershipRole.Auditor, replicaRole: ResourceMembershipRole.Operator });
    await one.listFlags();
    const many = build({
      primaryRole: ResourceMembershipRole.Auditor,
      replicaRole: ResourceMembershipRole.Operator,
      requestCount: 3
    });

    expect(await many.listFlags()).toEqual([true, true, true]);
    expect(many.membershipDAL.find).toHaveBeenCalledTimes(one.membershipDAL.find.mock.calls.length);
    expect(many.approvalRequestDAL.find).toHaveBeenCalledTimes(1);
    expect(many.approvalRequestDAL.findStepsByRequestIds).toHaveBeenCalledTimes(1);
    expect(many.approvalRequestDAL.findStepsByRequestIds).toHaveBeenCalledWith(
      ["revocation-1", "revocation-2", "revocation-3"],
      many.primaryDb
    );
  });
});
