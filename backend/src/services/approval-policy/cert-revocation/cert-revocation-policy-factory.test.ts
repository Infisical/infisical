import { describe, expect, it, vi } from "vitest";

import { AccessScope, OrgMembershipStatus } from "@app/db/schemas";
import { BadRequestError, ForbiddenRequestError } from "@app/lib/errors";

import {
  ApprovalNotificationEvent,
  ApprovalPolicyScope,
  ApprovalRequestApprovalDecision,
  ApproverType
} from "../approval-policy-enums";
import { certRevocationApprovalResourceFactory } from "./cert-revocation-policy-factory";

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({ SITE_URL: "https://app.example.com" })
}));

const applicationId = "6f1c1f1e-3a51-4b7e-9d7e-6c6d7f0b1a01";
const otherApplicationId = "6f1c1f1e-3a51-4b7e-9d7e-6c6d7f0b1a02";

const makePolicy = (overrides: Record<string, unknown>) => ({
  id: "policy",
  isActive: true,
  scopeType: ApprovalPolicyScope.PkiApplication,
  scopeId: applicationId,
  conditions: { version: 1, conditions: [{ profileNames: ["prod-tls"] }] },
  steps: [],
  ...overrides
});

const primaryDb = { node: "primary" };

type TTestMembership = {
  id?: string;
  actorUserId: string | null;
  actorGroupId: string | null;
  isActive: boolean;
  role?: string;
};

type TOrgAccess = {
  deactivated?: string[];
  invited?: string[];
  viaLinkedGroupOnly?: string[];
  subOrgOf?: string;
  deactivatedInRoot?: string[];
};

// Every user has an active, accepted organization membership of their own, except those listed in the last argument:
// `viaLinkedGroupOnly` users have no row of their own and reach the organization through a group linked into it.
// With `subOrgOf`, the organization is a sub-org of that root, where everyone is active except `deactivatedInRoot`.
const setup = (
  policies: unknown[],
  memberships: TTestMembership[] = [],
  groupLinks: { userId: string; groupId: string }[] = [],
  { deactivated = [], invited = [], viaLinkedGroupOnly = [], subOrgOf, deactivatedInRoot = [] }: TOrgAccess = {}
) => {
  const withIds = memberships.map((m, i) => ({ ...m, id: m.id ?? `membership-${i}`, scopeOrgId: "org-1" }));
  const ownOrgRows = (userIds: string[]) =>
    userIds
      .filter((userId) => !viaLinkedGroupOnly.includes(userId))
      .map((actorUserId) => ({
        actorUserId,
        isActive: !deactivated.includes(actorUserId),
        status: invited.includes(actorUserId) ? OrgMembershipStatus.Invited : OrgMembershipStatus.Accepted
      }));
  const deps = {
    membershipDAL: {
      find: vi
        .fn()
        .mockImplementation(
          async (filter: { scope: string; isActive?: boolean; status?: string; $in?: { actorUserId?: string[] } }) =>
            filter.scope === AccessScope.Organization
              ? ownOrgRows(filter.$in?.actorUserId ?? []).filter(
                  (row) =>
                    (filter.isActive === undefined || row.isActive === filter.isActive) &&
                    (filter.status === undefined || row.status === filter.status)
                )
              : withIds
        )
    },
    orgDAL: {
      findMembership: vi
        .fn()
        .mockImplementation(async (filter: { $in: { actorUserId: string[] } }) => ownOrgRows(filter.$in.actorUserId)),
      findActorsWithActiveOrgAccess: vi
        .fn()
        .mockImplementation(async ({ orgId, userIds }: { orgId: string; userIds: string[] }) => ({
          userIds: new Set(
            userIds.filter((userId) =>
              subOrgOf && orgId === subOrgOf ? !deactivatedInRoot.includes(userId) : viaLinkedGroupOnly.includes(userId)
            )
          ),
          identityIds: new Set()
        })),
      findById: vi.fn().mockResolvedValue({ id: "org-1", rootOrgId: subOrgOf ?? null })
    },
    userDAL: {
      find: vi.fn().mockImplementation(async ({ $in }: { $in: { id: string[] } }) =>
        $in.id.map((id) => ({
          id,
          isAccepted: true,
          firstName: id === "auditor" ? "Ada" : null,
          lastName: id === "auditor" ? "Auditor" : null,
          email: `${id}@example.com`,
          username: id === "sso-auditor" ? "sso-handle" : `${id}@example.com`
        }))
      )
    },
    groupDAL: {
      find: vi
        .fn()
        .mockImplementation(async ({ $in }: { $in: { id: string[] } }) =>
          $in.id.map((id) => ({ id, name: `${id} name` }))
        )
    },
    membershipRoleDAL: {
      find: vi
        .fn()
        .mockImplementation(async ({ $in }: { $in: { membershipId: string[] } }) =>
          withIds
            .filter((m) => $in.membershipId.includes(m.id))
            .map((m) => ({ membershipId: m.id, role: m.role ?? "operator" }))
        )
    },
    userGroupMembershipDAL: {
      find: vi
        .fn()
        .mockImplementation(async ({ $in }: { $in: { userId?: string[]; groupId: string[] } }) =>
          groupLinks.filter((l) => (!$in.userId || $in.userId.includes(l.userId)) && $in.groupId.includes(l.groupId))
        )
    },
    approvalPolicyDAL: {
      findByProjectId: vi
        .fn()
        .mockImplementation(async (_type: unknown, _projectId: string, scope: { scopeType: string; scopeId: string }) =>
          (policies as { scopeType: string | null; scopeId: string | null }[]).filter(
            (p) => p.scopeType === scope.scopeType && p.scopeId === scope.scopeId
          )
        ),
      primaryNode: vi.fn().mockReturnValue(primaryDb)
    },
    certificateService: { revokeApprovedCertificate: vi.fn().mockResolvedValue(undefined) }
  };
  return { deps, resource: certRevocationApprovalResourceFactory(deps as never) };
};

describe("certRevocationApprovalResourceFactory.matchPolicy", () => {
  it("matches the Application's active policy that lists the certificate's profile", async () => {
    const { deps, resource } = setup([
      makePolicy({ id: "other-app", scopeId: otherApplicationId }),
      makePolicy({ id: "inactive", isActive: false }),
      makePolicy({ id: "legacy", scopeType: null, scopeId: null }),
      makePolicy({ id: "other-profile", conditions: { version: 1, conditions: [{ profileNames: ["dev-tls"] }] } }),
      makePolicy({ id: "match" })
    ]);

    const policy = await resource.matchPolicy("project", { profileName: "prod-tls", applicationId });

    expect(policy?.id).toBe("match");
    expect(deps.approvalPolicyDAL.findByProjectId).toHaveBeenCalledWith(
      expect.anything(),
      "project",
      { scopeType: ApprovalPolicyScope.PkiApplication, scopeId: applicationId },
      primaryDb
    );
  });

  it("matches nothing when no policy lists the certificate's profile", async () => {
    const { resource } = setup([makePolicy({})]);

    const policy = await resource.matchPolicy("project", { profileName: "dev-tls", applicationId });

    expect(policy).toBeNull();
  });

  it("keeps only the approvers who can approve now on each step", async () => {
    const { resource } = setup(
      [
        makePolicy({
          id: "match",
          steps: [
            {
              requiredApprovals: 1,
              approvers: [
                { type: ApproverType.User, id: "operator" },
                { type: ApproverType.User, id: "auditor" },
                { type: ApproverType.Group, id: "auditor-group" },
                { type: ApproverType.User, id: "removed" }
              ]
            },
            { requiredApprovals: 1, approvers: [{ type: ApproverType.Group, id: "operator-group" }] }
          ]
        })
      ],
      [
        { actorUserId: "operator", actorGroupId: null, isActive: true },
        { actorUserId: "auditor", actorGroupId: null, isActive: true, role: "auditor" },
        { actorUserId: null, actorGroupId: "auditor-group", isActive: true, role: "auditor" },
        { actorUserId: null, actorGroupId: "operator-group", isActive: true }
      ]
    );

    const policy = await resource.matchPolicy("project", { profileName: "prod-tls", applicationId });

    expect(policy?.steps.map((step) => step.approvers)).toEqual([
      [{ type: ApproverType.User, id: "operator" }],
      [{ type: ApproverType.Group, id: "operator-group" }]
    ]);
  });

  it("counts each step's distinct people who can approve, expanding groups and skipping deactivated members", async () => {
    const { deps, resource } = setup(
      [
        makePolicy({
          id: "match",
          steps: [
            {
              requiredApprovals: 1,
              approvers: [
                { type: ApproverType.User, id: "operator" },
                { type: ApproverType.User, id: "operator" },
                { type: ApproverType.Group, id: "operator-group" }
              ]
            },
            { requiredApprovals: 1, approvers: [{ type: ApproverType.Group, id: "empty-group" }] },
            { requiredApprovals: 1, approvers: [{ type: ApproverType.User, id: "deactivated" }] }
          ]
        })
      ],
      [
        { actorUserId: "operator", actorGroupId: null, isActive: true },
        { actorUserId: "deactivated", actorGroupId: null, isActive: true },
        { actorUserId: null, actorGroupId: "operator-group", isActive: true },
        { actorUserId: null, actorGroupId: "empty-group", isActive: true }
      ],
      [
        { userId: "operator", groupId: "operator-group" },
        { userId: "member", groupId: "operator-group" },
        { userId: "deactivated", groupId: "operator-group" }
      ],
      { deactivated: ["deactivated"] }
    );

    const policy = await resource.matchPolicy("project", { profileName: "prod-tls", applicationId });

    expect(policy?.steps.map((step) => ("approverCount" in step ? step.approverCount : undefined))).toEqual([2, 0, 0]);
    expect(deps.membershipDAL.find).toHaveBeenCalledWith(
      expect.objectContaining({ scope: AccessScope.Organization, scopeOrgId: "org-1", isActive: true }),
      { tx: primaryDb }
    );
  });
});

describe("certRevocationApprovalResourceFactory organization access of approvers", () => {
  const tx = { node: "tx" } as never;
  const operatorGroup = { actorUserId: null, actorGroupId: "operator-group", isActive: true };

  const evaluate = async (
    approvers: { type: ApproverType; id: string }[],
    memberships: TTestMembership[],
    groupLinks: { userId: string; groupId: string }[],
    orgAccess: TOrgAccess
  ) => {
    const { deps, resource } = setup(
      [makePolicy({ id: "match", steps: [{ requiredApprovals: 1, approvers }] })],
      memberships,
      groupLinks,
      orgAccess
    );
    const policy = await resource.matchPolicy("project", { profileName: "prod-tls", applicationId });
    const undecidable = (
      await resource.findUndecidableRequestIds?.({
        requests: [
          {
            request: { id: "request-1", projectId: "project", scopeId: applicationId, currentStep: 1 } as never,
            steps: [{ stepNumber: 1, requiredApprovals: 1, approvers, approvals: [] }]
          }
        ],
        tx
      })
    )?.has("request-1");
    const [step] = policy?.steps ?? [];
    return {
      approverCount: step && "approverCount" in step ? step.approverCount : undefined,
      undecidable,
      deps,
      resource
    };
  };

  it("counts a sub-org user named directly who reaches the organization only through a linked group", async () => {
    const approvers = [{ type: ApproverType.User, id: "sub-org-user" }];
    const { approverCount, undecidable, deps, resource } = await evaluate(
      approvers,
      [{ actorUserId: "sub-org-user", actorGroupId: null, isActive: true }],
      [],
      { viaLinkedGroupOnly: ["sub-org-user"] }
    );

    expect(approverCount).toBe(1);
    expect(undecidable).toBe(false);
    await expect(
      resource.assertCanReview!({
        request: {
          projectId: "project",
          scopeType: ApprovalPolicyScope.PkiApplication,
          scopeId: applicationId
        } as never,
        decision: ApprovalRequestApprovalDecision.Approved,
        actor: { id: "sub-org-user" } as never,
        userGroupIds: new Set(),
        stepApprovers: approvers
      })
    ).resolves.toBeUndefined();
    expect(deps.orgDAL.findMembership).toHaveBeenCalledWith(expect.anything(), { tx: primaryDb });
    expect(deps.orgDAL.findMembership).toHaveBeenCalledWith(expect.anything(), { tx });
  });

  it("doesn't count a user named directly who was invited and hasn't accepted", async () => {
    const { approverCount, undecidable } = await evaluate(
      [{ type: ApproverType.User, id: "invited" }],
      [{ actorUserId: "invited", actorGroupId: null, isActive: true }],
      [],
      { invited: ["invited"] }
    );

    expect(approverCount).toBe(0);
    expect(undecidable).toBe(true);
  });

  it("doesn't count a group entry's members who lack an accepted organization membership of their own", async () => {
    const { approverCount, undecidable } = await evaluate(
      [{ type: ApproverType.Group, id: "operator-group" }],
      [operatorGroup],
      [
        { userId: "sub-org-user", groupId: "operator-group" },
        { userId: "invited", groupId: "operator-group" }
      ],
      { viaLinkedGroupOnly: ["sub-org-user"], invited: ["invited"] }
    );

    expect(approverCount).toBe(0);
    expect(undecidable).toBe(true);
  });

  describe("in a sub-organization", () => {
    it("doesn't count a user named directly whose root organization membership was deactivated", async () => {
      const { approverCount, undecidable } = await evaluate(
        [{ type: ApproverType.User, id: "sub-org-user" }],
        [{ actorUserId: "sub-org-user", actorGroupId: null, isActive: true }],
        [],
        { subOrgOf: "root-org", deactivatedInRoot: ["sub-org-user"] }
      );

      expect(approverCount).toBe(0);
      expect(undecidable).toBe(true);
    });

    it("doesn't count a group entry's member whose root organization membership was deactivated", async () => {
      const { approverCount, undecidable } = await evaluate(
        [{ type: ApproverType.Group, id: "operator-group" }],
        [operatorGroup],
        [{ userId: "sub-org-user", groupId: "operator-group" }],
        { subOrgOf: "root-org", deactivatedInRoot: ["sub-org-user"] }
      );

      expect(approverCount).toBe(0);
      expect(undecidable).toBe(true);
    });

    it("counts an approver who is active in both the sub-org and its root organization, reading the primary", async () => {
      const { approverCount, undecidable, deps } = await evaluate(
        [{ type: ApproverType.User, id: "sub-org-user" }],
        [{ actorUserId: "sub-org-user", actorGroupId: null, isActive: true }],
        [],
        { subOrgOf: "root-org", deactivatedInRoot: ["someone-else"] }
      );

      expect(approverCount).toBe(1);
      expect(undecidable).toBe(false);
      expect(deps.orgDAL.findActorsWithActiveOrgAccess).toHaveBeenCalledWith(
        expect.objectContaining({ orgId: "root-org" }),
        primaryDb
      );
    });
  });
});

describe("certRevocationApprovalResourceFactory.findUndecidableRequestIds", () => {
  const tx = { node: "tx" } as never;
  const operator = { actorUserId: "operator", actorGroupId: null, isActive: true };
  const other = { actorUserId: "other", actorGroupId: null, isActive: true };
  const demoted = { actorUserId: "demoted", actorGroupId: null, isActive: true, role: "auditor" };
  const user = (id: string) => ({ type: ApproverType.User, id });

  const step = (
    stepNumber: number,
    requiredApprovals: number,
    approvers: { type: ApproverType; id: string }[],
    approvedBy: string[] = []
  ) => ({
    stepNumber,
    requiredApprovals,
    approvers,
    approvals: approvedBy.map((approverUserId) => ({ approverUserId }))
  });

  const check = async (
    memberships: TTestMembership[],
    steps: ReturnType<typeof step>[],
    { currentStep = 1, groupLinks = [] as { userId: string; groupId: string }[] } = {}
  ) => {
    const { deps, resource } = setup([], memberships, groupLinks);
    const request = { id: "request-1", projectId: "project", scopeId: applicationId, currentStep } as never;
    const undecidable = (await resource.findUndecidableRequestIds?.({ requests: [{ request, steps }], tx }))?.has(
      "request-1"
    );
    return { undecidable, deps };
  };

  it("is undecidable once the step in progress's only approver is demoted to Auditor", async () => {
    const { undecidable } = await check([demoted], [step(1, 1, [user("demoted")])]);
    expect(undecidable).toBe(true);
  });

  it("is still decidable while another approver on the step in progress can approve", async () => {
    const { undecidable, deps } = await check([demoted, other], [step(1, 1, [user("demoted"), user("other")])]);
    expect(undecidable).toBe(false);
    expect(deps.membershipDAL.find).toHaveBeenCalledWith(expect.anything(), { tx });
  });

  it("is undecidable when the one approval still needed has nobody left who hasn't voted", async () => {
    const { undecidable } = await check([other, demoted], [step(1, 2, [user("other"), user("demoted")], ["other"])]);
    expect(undecidable).toBe(true);
  });

  it("is still decidable when someone who hasn't voted can give the approval still needed", async () => {
    const { undecidable } = await check([other, operator], [step(1, 2, [user("other"), user("operator")], ["other"])]);
    expect(undecidable).toBe(false);
  });

  it("is undecidable when a later step's only approver is a group with no members", async () => {
    const { undecidable } = await check(
      [other, { actorUserId: null, actorGroupId: "empty-group", isActive: true }],
      [step(1, 1, [user("other")]), step(2, 1, [{ type: ApproverType.Group, id: "empty-group" }])]
    );
    expect(undecidable).toBe(true);
  });

  it("ignores a completed step whose approvers have since lost their role", async () => {
    const { undecidable } = await check(
      [demoted, other],
      [step(1, 1, [user("demoted")], ["demoted"]), step(2, 1, [user("other")])],
      {
        currentStep: 2
      }
    );
    expect(undecidable).toBe(false);
  });
});

describe("certRevocationApprovalResourceFactory.postApprovalRoutine", () => {
  it("revokes the certificate the approved request names", async () => {
    const { deps, resource } = setup([]);
    const request = { id: "approval-1", requestData: { requestData: { certificateId: "cert-1" } } } as never;

    await resource.postApprovalRoutine!(request);

    expect(deps.certificateService.revokeApprovedCertificate).toHaveBeenCalledWith(request);
  });
});

describe("certRevocationApprovalResourceFactory.buildNotification", () => {
  const request = {
    id: "approval-1",
    type: "cert-revocation",
    organizationId: "org-1",
    requesterName: "Alice",
    requesterEmail: "alice@example.com",
    requestData: { requestData: { commonName: "api.example.com" } }
  } as never;

  it("asks approvers to review a new revocation request, naming the certificate", async () => {
    const { resource } = setup([]);

    const notification = await resource.buildNotification!({ event: ApprovalNotificationEvent.Requested, request });

    expect(notification?.inApp?.body).toContain("api.example.com");
    expect(notification?.inApp?.link).toContain("/cert-manager/approvals/approval-1?policyType=cert-revocation");
    expect(notification?.email?.substitutions.requestType).toBe("certificate revocation request");
  });

  it("tells everyone involved that an approved revocation didn't complete, and why, without guessing the certificate's state", async () => {
    const { resource } = setup([]);

    const notification = await resource.buildNotification!({
      event: ApprovalNotificationEvent.ApprovedActionFailed,
      request,
      failureReason: "AWS PCA timed out"
    });

    expect(notification?.inApp?.body).toBe(
      "The approved revocation of the certificate 'api.example.com' didn't complete. Reason: AWS PCA timed out"
    );
    expect(notification?.inApp?.link).toContain("/cert-manager/approvals/approval-1?policyType=cert-revocation");
  });

  describe("for a certificate with no common name", () => {
    const unnamedRequest = {
      id: "approval-1",
      type: "cert-revocation",
      organizationId: "org-1",
      requesterName: "Alice",
      requesterEmail: "alice@example.com",
      requestData: { requestData: { commonName: "", serialNumber: "0a1b" } }
    } as never;

    it("names the certificate by its serial number in the review request", async () => {
      const { resource } = setup([]);

      const notification = await resource.buildNotification!({
        event: ApprovalNotificationEvent.Requested,
        request: unnamedRequest
      });

      expect(notification?.inApp?.body).toBe("Alice asked to revoke the certificate '0a1b'.");
    });

    it("names the certificate by its serial number in the failure notice", async () => {
      const { resource } = setup([]);

      const notification = await resource.buildNotification!({
        event: ApprovalNotificationEvent.ApprovedActionFailed,
        request: unnamedRequest,
        failureReason: "AWS PCA timed out"
      });

      expect(notification?.inApp?.body).toBe(
        "The approved revocation of the certificate '0a1b' didn't complete. Reason: AWS PCA timed out"
      );
    });
  });

  it("sends nothing for decisions, which show on the certificate itself", async () => {
    const { resource } = setup([]);

    const notification = await resource.buildNotification!({ event: ApprovalNotificationEvent.Approved, request });

    expect(notification).toBeNull();
  });
});

describe("certRevocationApprovalResourceFactory live approver checks", () => {
  const actor = { id: "approver-1" } as never;
  const request = {
    projectId: "project",
    scopeType: ApprovalPolicyScope.PkiApplication,
    scopeId: applicationId
  } as never;
  const decision = ApprovalRequestApprovalDecision.Approved;
  const namedUser = [{ type: ApproverType.User, id: "approver-1" }];
  const namedGroup = [{ type: ApproverType.Group, id: "group-1" }];

  const directMember = { actorUserId: "approver-1", actorGroupId: null, isActive: true };
  const groupMember = { actorUserId: null, actorGroupId: "group-1", isActive: true };
  const otherMember = { actorUserId: "someone-else", actorGroupId: null, isActive: true };
  const noRoleMessage =
    "You can't review this request because you no longer have a role in its Application that can approve requests.";

  it("lets a direct member of the request's Application review it, reading the primary", async () => {
    const { deps, resource } = setup([], [directMember]);

    await expect(
      resource.assertCanReview!({ request, decision, actor, userGroupIds: new Set(), stepApprovers: namedUser })
    ).resolves.toBeUndefined();
    expect(deps.membershipDAL.find).toHaveBeenLastCalledWith(
      expect.objectContaining({ scopeProjectId: "project", scopeResourceId: applicationId }),
      { tx: primaryDb }
    );
  });

  it("lets a member named through their group review it", async () => {
    const { resource } = setup([], [groupMember]);

    await expect(
      resource.assertCanReview!({
        request,
        decision,
        actor,
        userGroupIds: new Set(["group-1"]),
        stepApprovers: namedGroup
      })
    ).resolves.toBeUndefined();
  });

  it("lets a user named directly review it while their approving role comes through a group", async () => {
    const { resource } = setup([], [groupMember], [{ userId: "approver-1", groupId: "group-1" }]);

    await expect(
      resource.assertCanReview!({
        request,
        decision,
        actor,
        userGroupIds: new Set(["group-1"]),
        stepApprovers: namedUser
      })
    ).resolves.toBeUndefined();
  });

  it("refuses a user removed from the Application", async () => {
    const { resource } = setup([], [otherMember, groupMember]);

    await expect(
      resource.assertCanReview!({
        request,
        decision,
        actor,
        userGroupIds: new Set(["group-2"]),
        stepApprovers: namedUser
      })
    ).rejects.toThrow(noRoleMessage);
  });

  it("refuses a user whose Application membership is inactive", async () => {
    const { resource } = setup([], [{ ...directMember, isActive: false }]);

    await expect(
      resource.assertCanReview!({ request, decision, actor, userGroupIds: new Set(), stepApprovers: namedUser })
    ).rejects.toBeInstanceOf(ForbiddenRequestError);
  });

  it.each([
    ["removed from the Application", [directMember]],
    ["demoted to Auditor", [directMember, { ...groupMember, role: "auditor" }]]
  ])(
    "refuses a user named only through a group that was %s, even though they hold their own approving role",
    async (_, memberships) => {
      const { resource } = setup([], memberships);

      await expect(
        resource.assertCanReview!({
          request,
          decision,
          actor,
          userGroupIds: new Set(["group-1"]),
          stepApprovers: namedGroup
        })
      ).rejects.toThrow(
        "You can't review this request because the group that names you as an approver no longer has a role in its Application that can approve requests."
      );
    }
  );

  it("reads the primary when deciding whether the actor is still an approver", async () => {
    const { deps, resource } = setup([], [directMember]);

    await expect(
      resource.isLiveApprover!({ projectId: "project", scopeId: applicationId, actor, userGroupIds: new Set() })
    ).resolves.toBe(true);
    expect(deps.membershipDAL.find).toHaveBeenCalledWith(expect.anything(), { tx: primaryDb });
  });

  it("stops treating a user removed from the Application as an approver", async () => {
    const { resource } = setup([], [otherMember]);

    await expect(
      resource.isLiveApprover!({ projectId: "project", scopeId: applicationId, actor, userGroupIds: new Set() })
    ).resolves.toBe(false);
  });

  describe("for a member demoted to Auditor", () => {
    const demoted = { ...directMember, role: "auditor" };

    it.each([ApprovalRequestApprovalDecision.Approved, ApprovalRequestApprovalDecision.Rejected])(
      "refuses their %s decision",
      async (auditorDecision) => {
        const { resource } = setup([], [demoted]);

        await expect(
          resource.assertCanReview!({
            request,
            decision: auditorDecision,
            actor,
            userGroupIds: new Set(),
            stepApprovers: namedUser
          })
        ).rejects.toThrow(noRoleMessage);
      }
    );

    it("refuses a member whose only membership is an Auditor group", async () => {
      const { resource } = setup([], [{ ...groupMember, role: "auditor" }]);

      await expect(
        resource.assertCanReview!({
          request,
          decision,
          actor,
          userGroupIds: new Set(["group-1"]),
          stepApprovers: namedGroup
        })
      ).rejects.toThrow(noRoleMessage);
    });

    it("still lets them review through a group that holds an approving role", async () => {
      const { resource } = setup([], [demoted, groupMember], [{ userId: "approver-1", groupId: "group-1" }]);

      await expect(
        resource.assertCanReview!({
          request,
          decision,
          actor,
          userGroupIds: new Set(["group-1"]),
          stepApprovers: namedUser
        })
      ).resolves.toBeUndefined();
    });

    it("stops treating them as an approver", async () => {
      const { resource } = setup([], [demoted]);

      await expect(
        resource.isLiveApprover!({ projectId: "project", scopeId: applicationId, actor, userGroupIds: new Set() })
      ).resolves.toBe(false);
    });
  });
});

describe("certRevocationApprovalResourceFactory.verifyPolicyActors", () => {
  const verify = (resource: ReturnType<typeof setup>["resource"], approvers: { type: ApproverType; id: string }[]) =>
    resource.verifyPolicyActors!({ projectId: "project", scopeId: applicationId, approvers, bypassers: [] });

  it("accepts approvers who hold an approving role directly or through a group", async () => {
    const { resource } = setup(
      [],
      [
        { actorUserId: "operator", actorGroupId: null, isActive: true },
        { actorUserId: null, actorGroupId: "operator-group", isActive: true }
      ],
      [{ userId: "via-group", groupId: "operator-group" }]
    );

    await expect(
      verify(resource, [
        { type: ApproverType.User, id: "operator" },
        { type: ApproverType.User, id: "via-group" },
        { type: ApproverType.Group, id: "operator-group" }
      ])
    ).resolves.toBeUndefined();
  });

  it("refuses Auditors and non-members, naming the Application's members and giving outsiders' IDs back", async () => {
    const { deps, resource } = setup(
      [],
      [
        { actorUserId: "auditor", actorGroupId: null, isActive: true, role: "auditor" },
        { actorUserId: "sso-auditor", actorGroupId: null, isActive: true, role: "auditor" },
        { actorUserId: null, actorGroupId: "auditor-group", isActive: true, role: "auditor" }
      ]
    );

    const result = verify(resource, [
      { type: ApproverType.User, id: "auditor" },
      { type: ApproverType.User, id: "sso-auditor" },
      { type: ApproverType.User, id: "outsider" },
      { type: ApproverType.Group, id: "auditor-group" },
      { type: ApproverType.Group, id: "outsider-group" }
    ]);

    await expect(result).rejects.toBeInstanceOf(BadRequestError);
    await expect(result).rejects.toThrow(
      "Revocation approvers need an Admin or Operator role in the Application, so they can approve requests. These approvers are Auditors or aren't in the Application: users Ada Auditor, sso-handle, outsider; groups auditor-group name, outsider-group."
    );
    const lookups = [...deps.userDAL.find.mock.calls, ...deps.groupDAL.find.mock.calls] as [
      { $in: { id: string[] } }
    ][];
    const lookedUp = lookups.flatMap(([filter]) => filter.$in.id);
    expect(lookedUp).not.toContain("outsider");
    expect(lookedUp).not.toContain("outsider-group");
  });
});

describe("certRevocationApprovalResourceFactory.filterActiveApprovers", () => {
  it("notifies only approvers who still hold an active membership in the request's Application", async () => {
    const { deps, resource } = setup(
      [],
      [
        { actorUserId: "direct", actorGroupId: null, isActive: true },
        { actorUserId: "deactivated", actorGroupId: null, isActive: false },
        { actorUserId: null, actorGroupId: "member-group", isActive: true }
      ],
      [
        { userId: "via-group", groupId: "member-group" },
        { userId: "removed", groupId: "other-group" }
      ]
    );
    const request = { projectId: "project", scopeId: applicationId } as never;

    const eligible = await resource.filterActiveApprovers!(request, [
      { type: ApproverType.User, id: "direct" },
      { type: ApproverType.User, id: "via-group" },
      { type: ApproverType.User, id: "removed" },
      { type: ApproverType.User, id: "deactivated" },
      { type: ApproverType.Group, id: "member-group" },
      { type: ApproverType.Group, id: "removed-group" }
    ]);

    expect(eligible).toEqual([
      { type: ApproverType.User, id: "direct" },
      { type: ApproverType.User, id: "via-group" },
      { type: ApproverType.Group, id: "member-group" }
    ]);
    expect(deps.membershipDAL.find).toHaveBeenCalledWith(
      expect.objectContaining({ scopeProjectId: "project", scopeResourceId: applicationId }),
      { tx: primaryDb }
    );
  });

  it("doesn't notify approvers whose Application role is Auditor, directly or through a group", async () => {
    const { resource } = setup(
      [],
      [
        { actorUserId: "operator", actorGroupId: null, isActive: true },
        { actorUserId: "demoted", actorGroupId: null, isActive: true, role: "auditor" },
        { actorUserId: null, actorGroupId: "auditor-group", isActive: true, role: "auditor" }
      ],
      [{ userId: "via-auditor-group", groupId: "auditor-group" }]
    );

    const eligible = await resource.filterActiveApprovers!({ projectId: "project", scopeId: applicationId } as never, [
      { type: ApproverType.User, id: "operator" },
      { type: ApproverType.User, id: "demoted" },
      { type: ApproverType.User, id: "via-auditor-group" },
      { type: ApproverType.Group, id: "auditor-group" }
    ]);

    expect(eligible).toEqual([{ type: ApproverType.User, id: "operator" }]);
  });

  it("notifies no approver when the request names no Application", async () => {
    const { resource } = setup([], [{ actorUserId: "direct", actorGroupId: null, isActive: true }]);

    await expect(
      resource.filterActiveApprovers!({ projectId: "project", scopeId: null } as never, [
        { type: ApproverType.User, id: "direct" }
      ])
    ).resolves.toEqual([]);
  });
});
