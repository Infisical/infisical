import { describe, expect, test } from "vitest";

import { BypasserType } from "@app/ee/services/access-approval-policy/access-approval-policy-types";
import { ApprovalStatus } from "@app/ee/services/access-approval-request/access-approval-request-types";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import {
  ApprovalRequestApprovalDecision,
  ApprovalRequestGrantStatus,
  ApprovalRequestStatus,
  ApproverType
} from "@app/services/approval-policy/approval-policy-enums";

import {
  collectSecretAccessRequestUserIds,
  composeSecretAccessRequestRows,
  isPolicySubjectMatch,
  toLegacyAccessApprovalRequest,
  TSecretAccessRequestListInput
} from "./secret-access-approval-request-bridge-fns";

type TRequest = TSecretAccessRequestListInput["requests"][number];
type TPolicy = TSecretAccessRequestListInput["policies"][number];
type TGrant = TSecretAccessRequestListInput["grants"][number];
type TPrivilege = TSecretAccessRequestListInput["privileges"][number];
type TApproval = TSecretAccessRequestListInput["approvals"][number];

const ENV_ID = "7b8f3a52-91c4-4d0e-9a6b-2f1c5e8d4a73";
const PERMISSIONS = [["read", "secrets", { environment: "dev", secretPath: { $glob: "/app" } }]];
const createdAt = new Date("2026-01-01T00:00:00.000Z");
const updatedAt = new Date("2026-01-02T00:00:00.000Z");

const storedRequestData = (overrides: Partial<{ isTemporary: boolean; temporaryRange: string | null }> = {}) => ({
  version: 1,
  requestData: {
    envId: ENV_ID,
    envSlug: "dev",
    secretPath: "/app",
    permissions: PERMISSIONS,
    isTemporary: false,
    temporaryRange: null,
    ...overrides
  }
});

const request = (overrides: Partial<TRequest> = {}): TRequest =>
  ({
    id: "req-1",
    policyId: "policy-1",
    requesterId: "requester",
    organizationId: "org-1",
    projectId: "project-1",
    requestData: storedRequestData(),
    justification: "need it",
    status: ApprovalRequestStatus.Pending,
    expiresAt: null,
    createdAt,
    updatedAt,
    ...overrides
  }) as TRequest;

const grant = (overrides: Partial<TGrant> = {}): TGrant =>
  ({
    id: "grant-1",
    requestId: "req-1",
    status: ApprovalRequestGrantStatus.Active,
    createdAt,
    revokedAt: null,
    revokedByUserId: null,
    isBreakGlass: false,
    bypassReason: null,
    ...overrides
  }) as TGrant;

const privilege = (overrides: Partial<TPrivilege> = {}): TPrivilege =>
  ({
    id: "privilege-1",
    grantId: "grant-1",
    projectId: "project-1",
    actorUserId: "requester",
    isTemporary: false,
    temporaryMode: null,
    temporaryRange: null,
    temporaryAccessStartTime: null,
    temporaryAccessEndTime: null,
    permissions: PERMISSIONS,
    ...overrides
  }) as TPrivilege;

const approval = (overrides: Partial<TApproval> = {}): TApproval =>
  ({
    id: "approval-1",
    requestId: "req-1",
    stepId: "step-1",
    approverUserId: "approver-a",
    decision: ApprovalRequestApprovalDecision.Approved,
    createdAt,
    ...overrides
  }) as TApproval;

const policy = (overrides: Partial<TPolicy> = {}): TPolicy =>
  ({
    id: "policy-1",
    name: "Policy",
    projectId: "project-1",
    enforcementLevel: "hard",
    bypassForMachineIdentities: false,
    createdAt,
    updatedAt,
    deletedAt: null,
    secretPath: "/app",
    envId: ENV_ID,
    maxTimePeriod: null,
    allowedSelfApprovals: true,
    requestExpirationTime: null,
    approvals: 1,
    approvers: [{ id: "approver-a", type: ApproverType.User, name: "approver-a", sequence: 1, approvalsRequired: 1 }],
    bypassers: [],
    environment: { id: ENV_ID, name: "Development", slug: "dev" },
    environments: [{ id: ENV_ID, name: "Development", slug: "dev" }],
    ...overrides
  }) as TPolicy;

const user = (id: string) => ({ id, email: `${id}@example.com`, username: id, firstName: id, lastName: null });

const listInput = (overrides: Partial<TSecretAccessRequestListInput> = {}): TSecretAccessRequestListInput => ({
  requests: [request()],
  policies: [policy()],
  grants: [],
  privileges: [],
  approvals: [],
  groupMembers: [],
  users: [user("requester"), user("approver-a")],
  orgMemberships: [
    { actorUserId: "requester", isActive: true },
    { actorUserId: "approver-a", isActive: true }
  ],
  ...overrides
});

describe("toLegacyAccessApprovalRequest", () => {
  test("maps a pending request with no grant", () => {
    const legacy = toLegacyAccessApprovalRequest({ ...request(), grant: null, privilegeId: null });

    expect(legacy).toEqual({
      id: "req-1",
      policyId: "policy-1",
      requestedByUserId: "requester",
      isTemporary: false,
      temporaryRange: null,
      permissions: PERMISSIONS,
      note: "need it",
      privilegeId: null,
      status: ApprovalStatus.PENDING,
      expiresAt: null,
      approvedAt: null,
      approvedByUserId: null,
      revokedAt: null,
      revokedByUserId: null,
      createdAt,
      updatedAt,
      editedByUserId: null,
      editNote: null,
      bypassReason: null,
      privilegeDeletedAt: null
    });
  });

  test("an active grant exposes the privilege and the approval time", () => {
    const legacy = toLegacyAccessApprovalRequest(
      {
        ...request({
          status: ApprovalRequestStatus.Approved,
          requestData: storedRequestData({ isTemporary: true, temporaryRange: "1h" })
        }),
        grant: grant(),
        privilegeId: "privilege-1"
      },
      "approver-a"
    );

    expect(legacy.status).toBe(ApprovalStatus.APPROVED);
    expect(legacy.privilegeId).toBe("privilege-1");
    expect(legacy.approvedAt).toEqual(createdAt);
    expect(legacy.approvedByUserId).toBe("approver-a");
    expect(legacy.isTemporary).toBe(true);
    expect(legacy.temporaryRange).toBe("1h");
  });

  test("a revoked grant reports the revoked status and hides the privilege", () => {
    const revokedAt = new Date("2026-01-03T00:00:00.000Z");
    const legacy = toLegacyAccessApprovalRequest({
      ...request({ status: ApprovalRequestStatus.Approved }),
      grant: grant({ status: ApprovalRequestGrantStatus.Revoked, revokedAt, revokedByUserId: "admin" }),
      privilegeId: "privilege-1"
    });

    expect(legacy.status).toBe(ApprovalStatus.REVOKED);
    expect(legacy.privilegeId).toBeNull();
    expect(legacy.revokedAt).toEqual(revokedAt);
    expect(legacy.revokedByUserId).toBe("admin");
  });

  test("a cancelled request reads as rejected", () => {
    const legacy = toLegacyAccessApprovalRequest({
      ...request({ status: ApprovalRequestStatus.Cancelled }),
      grant: null,
      privilegeId: null
    });

    expect(legacy.status).toBe(ApprovalStatus.REJECTED);
  });

  test("only a break-glass grant carries its bypass reason", () => {
    const breakGlass = toLegacyAccessApprovalRequest({
      ...request({ status: ApprovalRequestStatus.Approved }),
      grant: grant({ isBreakGlass: true, bypassReason: "incident response" }),
      privilegeId: "privilege-1"
    });
    const regular = toLegacyAccessApprovalRequest({
      ...request({ status: ApprovalRequestStatus.Approved }),
      grant: grant({ isBreakGlass: false, bypassReason: "stale" }),
      privilegeId: "privilege-1"
    });

    expect(breakGlass.bypassReason).toBe("incident response");
    expect(regular.bypassReason).toBeNull();
  });

  test("rejects a request whose policy or requester is gone", () => {
    expect(() =>
      toLegacyAccessApprovalRequest({ ...request({ policyId: null }), grant: null, privilegeId: null })
    ).toThrow(BadRequestError);
    expect(() =>
      toLegacyAccessApprovalRequest({ ...request({ requesterId: null }), grant: null, privilegeId: null })
    ).toThrow(NotFoundError);
  });

  test("rejects malformed request data", () => {
    expect(() =>
      toLegacyAccessApprovalRequest({ ...request({ requestData: { version: 2 } }), grant: null, privilegeId: null })
    ).toThrow(BadRequestError);
  });
});

describe("isPolicySubjectMatch", () => {
  const subjects = [
    { type: ApproverType.User, id: "user-a" },
    { type: ApproverType.Group, id: "group-g" },
    { type: ApproverType.User, id: null }
  ];

  test("matches the actor directly or through a group", () => {
    expect(isPolicySubjectMatch(subjects, "user-a", new Set())).toBe(true);
    expect(isPolicySubjectMatch(subjects, "user-b", new Set(["group-g"]))).toBe(true);
  });

  test("does not match an outsider or a subject with no id", () => {
    expect(isPolicySubjectMatch(subjects, "user-b", new Set(["group-other"]))).toBe(false);
    expect(isPolicySubjectMatch([{ type: ApproverType.User, id: null }], "user-a", new Set())).toBe(false);
  });
});

describe("collectSecretAccessRequestUserIds", () => {
  test("collects every user a request row can name, once", () => {
    const userIds = collectSecretAccessRequestUserIds({
      requests: [
        request(),
        request({ id: "req-2", requesterId: "requester" }),
        request({ id: "req-3", requesterId: null })
      ],
      policies: [
        policy({
          approvers: [
            { id: "approver-a", type: ApproverType.User, name: "approver-a", sequence: 1, approvalsRequired: 1 },
            { id: "group-g", type: ApproverType.Group, sequence: 1, approvalsRequired: 1 }
          ]
        })
      ],
      grants: [grant({ revokedByUserId: "admin" }), grant({ id: "grant-2", revokedByUserId: null })],
      approvals: [approval(), approval({ id: "approval-2", approverUserId: "approver-b" })],
      groupMembers: [{ groupId: "group-g", userId: "member-1" }]
    });

    expect(userIds.sort()).toEqual(["admin", "approver-a", "approver-b", "member-1", "requester"]);
  });
});

describe("composeSecretAccessRequestRows", () => {
  test("expands group approvers and bypassers into their members", () => {
    const [row] = composeSecretAccessRequestRows(
      listInput({
        policies: [
          policy({
            approvers: [
              { id: "approver-a", type: ApproverType.User, name: "approver-a", sequence: 1, approvalsRequired: 1 },
              { id: "group-g", type: ApproverType.Group, sequence: 2, approvalsRequired: 2 }
            ],
            bypassers: [{ id: "group-g", type: BypasserType.Group }]
          })
        ],
        groupMembers: [
          { groupId: "group-g", userId: "member-1" },
          { groupId: "group-g", userId: "member-2" }
        ],
        users: [user("requester"), user("approver-a"), user("member-1")],
        orgMemberships: [
          { actorUserId: "approver-a", isActive: true },
          { actorUserId: "member-1", isActive: false }
        ]
      })
    );

    expect(row.policy?.approvers).toEqual([
      {
        userId: "approver-a",
        sequence: 1,
        approvalsRequired: 1,
        email: "approver-a@example.com",
        username: "approver-a",
        isOrgMembershipActive: true
      },
      {
        userId: "member-1",
        sequence: 2,
        approvalsRequired: 2,
        email: "member-1@example.com",
        username: "member-1",
        isOrgMembershipActive: false
      },
      { userId: "member-2", sequence: 2, approvalsRequired: 2, email: null, username: "", isOrgMembershipActive: false }
    ]);
    expect(row.policy?.bypassers).toEqual(["member-1", "member-2"]);
    expect(row.environment).toEqual({ id: ENV_ID, name: "Development", slug: "dev" });
  });

  test("attaches the newest grant, its privilege, the last approver and the reviewers", () => {
    const olderGrant = grant({ id: "grant-old", status: ApprovalRequestGrantStatus.Revoked, revokedByUserId: "admin" });
    const [row] = composeSecretAccessRequestRows(
      listInput({
        requests: [request({ status: ApprovalRequestStatus.Approved })],
        grants: [grant(), olderGrant],
        privileges: [privilege(), privilege({ id: "privilege-old", grantId: "grant-old" })],
        approvals: [
          approval({ id: "approval-1", approverUserId: "approver-a" }),
          approval({
            id: "approval-2",
            approverUserId: "approver-b",
            decision: ApprovalRequestApprovalDecision.Rejected
          }),
          approval({ id: "approval-3", approverUserId: "approver-c" })
        ],
        users: [user("requester"), user("approver-a"), user("approver-c")],
        orgMemberships: [
          { actorUserId: "requester", isActive: true },
          { actorUserId: "approver-a", isActive: true }
        ]
      })
    );

    expect(row.grant?.id).toBe("grant-1");
    expect(row.privilegeId).toBe("privilege-1");
    expect(row.privilege).toEqual({
      membershipId: "project-1",
      userId: "requester",
      projectId: "project-1",
      isTemporary: false,
      temporaryMode: null,
      temporaryRange: null,
      temporaryAccessStartTime: null,
      temporaryAccessEndTime: null,
      permissions: PERMISSIONS
    });
    expect(row.requestedByUser).toEqual({
      userId: "requester",
      email: "requester@example.com",
      firstName: "requester",
      lastName: null,
      username: "requester"
    });
    expect(row.approvedByUser?.userId).toBe("approver-c");
    expect(row.revokedByUser).toBeNull();
    expect(row.reviewers).toEqual([
      { userId: "approver-a", status: ApprovalRequestApprovalDecision.Approved, isOrgMembershipActive: true },
      { userId: "approver-b", status: ApprovalRequestApprovalDecision.Rejected, isOrgMembershipActive: false },
      { userId: "approver-c", status: ApprovalRequestApprovalDecision.Approved, isOrgMembershipActive: false }
    ]);
  });

  test("a request whose policy is gone keeps its own fields and drops the policy", () => {
    const [row] = composeSecretAccessRequestRows(listInput({ requests: [request({ policyId: null })] }));

    expect(row.policy).toBeNull();
    expect(row.environment).toBeNull();
    expect(row.grant).toBeNull();
    expect(row.privilegeId).toBeNull();
    expect(row.approvedByUser).toBeNull();
    expect(row.requestedByUser?.userId).toBe("requester");
  });

  test("a requester who no longer exists is reported as null", () => {
    const [row] = composeSecretAccessRequestRows(listInput({ requests: [request({ requesterId: null })] }));

    expect(row.requestedByUser).toBeNull();
  });
});
