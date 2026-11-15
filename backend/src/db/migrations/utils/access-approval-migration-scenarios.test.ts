// Lives under utils/ because tsdown compiles every src/db/migrations/*.ts into dist/db/migrations/,
// where knex would load a test file as a migration.
import { describe, expect, test } from "vitest";

import { TPolicyData, translatePolicy } from "../20261013120000_migrate-access-approval-policies-to-global";
import { TLegacyApprover, TLegacyReview, TMigrationFailure } from "./approval-migration";

type TRequest = TPolicyData["requests"][number];
type TAdditionalPrivilege = TPolicyData["additionalPrivileges"][number];

const T0 = new Date("2026-01-01T00:00:00Z");
const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);
const NOW = at(60);

const permissionsFor = (environment = "dev", secretPath = "/apps/api") => [
  ["read", "secrets", { environment, secretPath: { $glob: secretPath } }]
];

const approver = (approverUserId: string, opts: Partial<TLegacyApprover> = {}): TLegacyApprover => ({
  approverUserId,
  approverGroupId: null,
  sequence: 1,
  approvalsRequired: 1,
  ...opts
});

const groupApprover = (approverGroupId: string, opts: Partial<TLegacyApprover> = {}): TLegacyApprover => ({
  approverUserId: null,
  approverGroupId,
  sequence: 1,
  approvalsRequired: 1,
  ...opts
});

const env = (envSlug: string, projectId = "P") => ({ envId: `env-${envSlug}`, envSlug, projectId, orgId: "O" });

const scenario = (overrides: Partial<TPolicyData> = {}): TPolicyData => ({
  policy: {
    id: "pol-1",
    name: "Prod access",
    approvals: 1,
    secretPath: "/apps/**",
    enforcementLevel: "hard",
    allowedSelfApprovals: false,
    maxTimePeriod: "7d",
    requestExpirationTime: "1h",
    deletedAt: null,
    createdAt: at(0),
    updatedAt: at(1)
  },
  environments: [env("dev")],
  approvers: [approver("u1"), approver("u2")],
  bypassers: [],
  requests: [],
  reviews: [],
  additionalPrivileges: [],
  requesters: [{ id: "r1", username: "r1@example.com", email: "r1@example.com", firstName: "Ria", lastName: "Lee" }],
  groupMembers: [],
  requestIdsAlreadyOnGlobal: [],
  ...overrides
});

const request = (overrides: Partial<TRequest> = {}): TRequest => ({
  id: "req-1",
  requestedByUserId: "r1",
  status: "pending",
  permissions: permissionsFor(),
  isTemporary: false,
  temporaryRange: null,
  note: "need it",
  privilegeId: null,
  privilegeDeletedAt: null,
  expiresAt: at(120),
  approvedAt: null,
  revokedAt: null,
  revokedByUserId: null,
  bypassReason: null,
  createdAt: at(10),
  updatedAt: at(10),
  ...overrides
});

const approvedRequest = (overrides: Partial<TRequest> = {}) =>
  request({ status: "approved", approvedAt: at(20), updatedAt: at(20), privilegeId: "priv-1", ...overrides });

const additionalPrivilege = (overrides: Partial<TAdditionalPrivilege> = {}): TAdditionalPrivilege => ({
  id: "priv-1",
  actorUserId: "r1",
  projectId: "P",
  permissions: permissionsFor(),
  isTemporary: false,
  temporaryAccessEndTime: null,
  grantId: null,
  ...overrides
});

const review = (
  id: string,
  reviewerUserId: string,
  status: string,
  createdAt: Date,
  requestId = "req-1"
): TLegacyReview => ({ id, requestId, reviewerUserId, status, createdAt });

const run = (data: TPolicyData) => translatePolicy(data, NOW);
const codes = (failures: TMigrationFailure[]) => failures.map((failure) => failure.code);

describe("access approval migration scenarios that migrate", () => {
  test("translates a policy with two sequences, a group approver and bypassers", () => {
    const { failures, rows, projectId } = run(
      scenario({
        environments: [env("dev"), env("prod")],
        approvers: [approver("u1"), groupApprover("g1"), approver("u2", { sequence: 2 })],
        groupMembers: [{ groupId: "g1", userId: "u3" }],
        bypassers: [{ bypasserUserId: "b1" }, { bypasserUserId: "b1" }, { bypasserGroupId: "g2" }]
      })
    );

    expect(failures).toEqual([]);
    expect(projectId).toBe("P");
    expect(rows.policy).toEqual({
      id: "pol-1",
      projectId: "P",
      organizationId: "O",
      type: "secret-access",
      name: "Prod access",
      isActive: true,
      maxRequestTtl: null,
      conditions: { version: 1, conditions: {} },
      constraints: {
        version: 1,
        constraints: { allowedSelfApprovals: false, requestExpirationTime: "1h", maxTimePeriod: "7d" }
      },
      enforcementLevel: "hard",
      bypassForMachineIdentities: false,
      scopeType: null,
      scopeId: null,
      createdAt: at(0),
      updatedAt: at(1)
    });
    expect(rows.secretEnvironments).toEqual([
      { policyId: "pol-1", envId: "env-dev", secretPath: "/apps/**" },
      { policyId: "pol-1", envId: "env-prod", secretPath: "/apps/**" }
    ]);
    expect(rows.policySteps).toMatchObject([
      { policyId: "pol-1", stepNumber: 1, requiredApprovals: 1 },
      { policyId: "pol-1", stepNumber: 2, requiredApprovals: 1 }
    ]);
    expect(rows.policyStepApprovers).toEqual([
      { policyStepId: rows.policySteps[0].id, userId: "u1", groupId: null },
      { policyStepId: rows.policySteps[0].id, userId: null, groupId: "g1" },
      { policyStepId: rows.policySteps[1].id, userId: "u2", groupId: null }
    ]);
    expect(rows.bypassers).toEqual([
      { policyId: "pol-1", userId: "b1", groupId: null },
      { policyId: "pol-1", userId: null, groupId: "g2" }
    ]);
    expect(rows.requests).toEqual([]);
    expect(rows.grants).toEqual([]);
  });

  test("carries a live pending request over with its first step completed and the second in progress", () => {
    const { failures, rows } = run(
      scenario({
        approvers: [approver("u1"), approver("u2", { sequence: 2 })],
        requests: [request()],
        reviews: [review("rv1", "u1", "approved", at(15))]
      })
    );

    expect(failures).toEqual([]);
    expect(rows.requests).toEqual([
      {
        id: "req-1",
        projectId: "P",
        organizationId: "O",
        policyId: "pol-1",
        requesterId: "r1",
        requesterName: "Ria Lee",
        requesterEmail: "r1@example.com",
        type: "secret-access",
        status: "pending",
        justification: "need it",
        currentStep: 2,
        requestData: {
          version: 1,
          requestData: { permissions: permissionsFor(), isTemporary: false, temporaryRange: null }
        },
        expiresAt: at(120),
        machineIdentityId: null,
        scopeType: null,
        scopeId: null,
        createdAt: at(10),
        updatedAt: at(10)
      }
    ]);
    expect(rows.requestSteps).toEqual([
      expect.objectContaining({ stepNumber: 1, status: "completed", startedAt: at(10), completedAt: at(15) }),
      expect.objectContaining({ stepNumber: 2, status: "in-progress", startedAt: at(15), completedAt: null })
    ]);
    expect(rows.eligibleApprovers).toEqual([
      { stepId: rows.requestSteps[0].id, userId: "u1", groupId: null },
      { stepId: rows.requestSteps[1].id, userId: "u2", groupId: null }
    ]);
    expect(rows.approvals).toEqual([
      { stepId: rows.requestSteps[0].id, approverUserId: "u1", decision: "approved", comment: null, createdAt: at(15) }
    ]);
    expect(rows.grants).toEqual([]);
  });

  test("turns an approved request with a live additional privilege into an active grant linked to the additional privilege", () => {
    const { failures, rows } = run(
      scenario({
        requests: [approvedRequest()],
        additionalPrivileges: [additionalPrivilege()],
        reviews: [review("rv1", "u1", "approved", at(20))]
      })
    );

    expect(failures).toEqual([]);
    expect(rows.requests[0]).toMatchObject({ status: "approved", currentStep: 1 });
    expect(rows.requestSteps).toEqual([
      expect.objectContaining({ status: "completed", startedAt: at(10), completedAt: at(20) })
    ]);
    expect(rows.grants).toEqual([
      {
        id: expect.any(String),
        projectId: "P",
        requestId: "req-1",
        granteeUserId: "r1",
        type: "secret-access",
        attributes: { permissions: permissionsFor(), isTemporary: false, temporaryRange: null },
        createdAt: at(20),
        isBreakGlass: false,
        bypassReason: null,
        revokedAt: null,
        revokedByUserId: null,
        status: "active",
        expiresAt: null
      }
    ]);
    expect(rows.additionalPrivilegeGrants).toEqual([{ additionalPrivilegeId: "priv-1", grantId: rows.grants[0].id }]);
  });

  test("takes the grant expiry from a temporary additional privilege and marks it expired once past", () => {
    const live = run(
      scenario({
        requests: [approvedRequest({ isTemporary: true, temporaryRange: "2h" })],
        additionalPrivileges: [additionalPrivilege({ isTemporary: true, temporaryAccessEndTime: at(90) })]
      })
    );
    const past = run(
      scenario({
        requests: [approvedRequest({ isTemporary: true, temporaryRange: "2h" })],
        additionalPrivileges: [additionalPrivilege({ isTemporary: true, temporaryAccessEndTime: at(40) })]
      })
    );

    expect(live.failures).toEqual([]);
    expect(live.rows.grants[0]).toMatchObject({ status: "active", expiresAt: at(90) });
    expect(past.failures).toEqual([]);
    expect(past.rows.grants[0]).toMatchObject({ status: "expired", expiresAt: at(40) });
  });

  test("writes an expired grant for an approved request whose additional privilege is already gone", () => {
    const withRange = run(
      scenario({
        requests: [
          approvedRequest({ privilegeId: null, privilegeDeletedAt: at(50), isTemporary: true, temporaryRange: "1h" })
        ]
      })
    );
    const withoutRange = run(
      scenario({ requests: [approvedRequest({ privilegeId: null, privilegeDeletedAt: at(50) })] })
    );

    expect(withRange.failures).toEqual([]);
    expect(withRange.rows.grants[0]).toMatchObject({ status: "expired", expiresAt: at(80) });
    expect(withRange.rows.additionalPrivilegeGrants).toEqual([]);
    expect(withoutRange.failures).toEqual([]);
    expect(withoutRange.rows.grants[0]).toMatchObject({ status: "expired", expiresAt: at(50) });
  });

  test("keeps a revoked request approved with a revoked grant", () => {
    const { failures, rows } = run(
      scenario({
        requests: [
          request({
            status: "revoked",
            approvedAt: at(20),
            revokedAt: at(30),
            revokedByUserId: "adm",
            isTemporary: true,
            temporaryRange: "1h",
            updatedAt: at(30)
          })
        ]
      })
    );

    expect(failures).toEqual([]);
    expect(rows.requests[0]).toMatchObject({ status: "approved", currentStep: 1 });
    expect(rows.grants[0]).toMatchObject({
      status: "revoked",
      expiresAt: at(80),
      revokedAt: at(30),
      revokedByUserId: "adm"
    });
    expect(rows.additionalPrivilegeGrants).toEqual([]);
  });

  test("carries a rejected request over without a grant", () => {
    const { failures, rows } = run(
      scenario({ requests: [request({ status: "rejected" })], reviews: [review("rv1", "u1", "rejected", at(15))] })
    );

    expect(failures).toEqual([]);
    expect(rows.requests[0]).toMatchObject({ status: "rejected", currentStep: 1 });
    expect(rows.requestSteps[0]).toMatchObject({ status: "in-progress" });
    expect(rows.approvals[0]).toMatchObject({ decision: "rejected" });
    expect(rows.grants).toEqual([]);
  });

  test("expires a pending request past its deadline without running the live-request checks", () => {
    const { failures, rows } = run(
      scenario({ requests: [request({ expiresAt: at(30), permissions: permissionsFor("dev", "/other/x") })] })
    );

    expect(failures).toEqual([]);
    expect(rows.requests[0]).toMatchObject({ status: "expired", expiresAt: at(30) });
  });

  test("records a break-glass approval on the grant", () => {
    const { failures, rows } = run(
      scenario({
        requests: [approvedRequest({ bypassReason: "incident 42" })],
        additionalPrivileges: [additionalPrivilege()]
      })
    );

    expect(failures).toEqual([]);
    expect(rows.grants[0]).toMatchObject({ isBreakGlass: true, bypassReason: "incident 42" });
  });
  test("treats a requester's own approval on a soft policy as break-glass even without a reason", () => {
    const { failures, rows } = run(
      scenario({
        policy: { ...scenario().policy, enforcementLevel: "soft" },
        requests: [approvedRequest()],
        additionalPrivileges: [additionalPrivilege()],
        reviews: [review("rv1", "r1", "approved", at(20))]
      })
    );

    expect(failures).toEqual([]);
    expect(rows.grants[0]).toMatchObject({ isBreakGlass: true, bypassReason: null });
  });

  test("keeps a requester's own approval on a hard policy as a regular approval", () => {
    const { failures, rows } = run(
      scenario({
        policy: { ...scenario().policy, allowedSelfApprovals: true },
        approvers: [approver("r1"), approver("u2")],
        requests: [approvedRequest()],
        additionalPrivileges: [additionalPrivilege()],
        reviews: [review("rv1", "r1", "approved", at(20))]
      })
    );

    expect(failures).toEqual([]);
    expect(rows.grants[0]).toMatchObject({ isBreakGlass: false, bypassReason: null });
  });

  test("counts a user named directly and through a group once on a pending request", () => {
    const { failures } = run(
      scenario({
        approvers: [approver("u1", { approvalsRequired: 2 }), groupApprover("g1", { approvalsRequired: 2 })],
        groupMembers: [
          { groupId: "g1", userId: "u1" },
          { groupId: "g1", userId: "u2" }
        ],
        requests: [request()],
        reviews: [review("rv1", "u1", "approved", at(15))]
      })
    );

    expect(failures).toEqual([]);
  });

  test("keeps a sequence whose only group has no members, so whoever joins the group can approve", () => {
    const { failures, rows } = run(scenario({ approvers: [groupApprover("g1")], requests: [request()] }));

    expect(failures).toEqual([]);
    expect(rows.policyStepApprovers).toEqual([{ policyStepId: rows.policySteps[0].id, userId: null, groupId: "g1" }]);
    expect(rows.eligibleApprovers).toEqual([{ stepId: rows.requestSteps[0].id, userId: null, groupId: "g1" }]);
  });
});

describe("access approval migration scenarios that fail the checks", () => {
  test("policy without environments", () => {
    const { failures, projectId } = run(scenario({ environments: [] }));

    expect(codes(failures)).toEqual(["no-environments"]);
    expect(projectId).toBeUndefined();
  });

  test("policy whose environments span projects", () => {
    const { failures } = run(scenario({ environments: [env("dev", "P1"), env("prod", "P2")] }));

    expect(codes(failures)).toEqual(["environments-span-projects"]);
  });

  test("policy without approvers", () => {
    expect(codes(run(scenario({ approvers: [] })).failures)).toEqual(["no-approvers"]);
  });

  test("approvers that disagree on the approvals a sequence needs", () => {
    const { failures } = run(
      scenario({ approvers: [approver("u1", { approvalsRequired: 2 }), approver("u2", { approvalsRequired: 1 })] })
    );

    expect(codes(failures)).toEqual(["step-approvals-disagree"]);
  });

  test("policy asking for several approvals while its first sequence has no approvalsRequired", () => {
    const { failures } = run(
      scenario({
        policy: { ...scenario().policy, approvals: 2 },
        approvers: [approver("u1", { approvalsRequired: null }), approver("u2", { approvalsRequired: null })]
      })
    );

    expect(codes(failures)).toEqual(["ambiguous-required-approvals"]);
  });

  test("sequence that needs more approvals than it has user approvers", () => {
    const { failures } = run(scenario({ approvers: [approver("u1", { approvalsRequired: 2 })] }));

    expect(codes(failures)).toEqual(["required-approvals-exceed-approvers"]);
  });

  test("request that already exists on the global system", () => {
    const { failures } = run(scenario({ requests: [request()], requestIdsAlreadyOnGlobal: ["req-1"] }));

    expect(codes(failures)).toEqual(["request-already-migrated"]);
  });

  test("request with a status the global system has no equivalent for", () => {
    const { failures } = run(scenario({ requests: [request({ status: "weird" })] }));

    expect(failures).toEqual([expect.objectContaining({ code: "unknown-request-status", requestId: "req-1" })]);
  });

  test("review with a status that is neither approved nor rejected", () => {
    const { failures } = run(scenario({ requests: [request()], reviews: [review("rv1", "u1", "pending", at(15))] }));

    expect(failures).toEqual([expect.objectContaining({ code: "unknown-review-status", requestId: "req-1" })]);
  });

  test("request whose requester no longer exists", () => {
    const { failures, rows } = run(scenario({ requests: [request({ requestedByUserId: "ghost" })] }));

    expect(failures).toEqual([expect.objectContaining({ code: "requester-missing", requestId: "req-1" })]);
    expect(rows.requests[0]).toMatchObject({ requesterName: "", requesterEmail: "" });
  });

  describe("additional privilege state", () => {
    const additionalPrivilegeFailures = (failures: TMigrationFailure[], requestId = "req-1") =>
      failures
        .filter((failure) => failure.code === "privilege-state-mismatch" && failure.requestId === requestId)
        .map((failure) => failure.message);

    test("pending request still pointing at a additional privilege", () => {
      const { failures } = run(
        scenario({ requests: [request({ privilegeId: "priv-1" })], additionalPrivileges: [additionalPrivilege()] })
      );

      expect(additionalPrivilegeFailures(failures)).toEqual([
        "A pending request still points to additional privilege priv-1"
      ]);
    });

    test("approved request whose additional privilege row is missing", () => {
      const { failures } = run(scenario({ requests: [approvedRequest()] }));

      expect(additionalPrivilegeFailures(failures)).toEqual(["Additional privilege priv-1 does not exist"]);
    });

    test("additional privilege held by another user", () => {
      const { failures } = run(
        scenario({
          requests: [approvedRequest()],
          additionalPrivileges: [additionalPrivilege({ actorUserId: "someone-else" })]
        })
      );

      expect(additionalPrivilegeFailures(failures)).toEqual([
        "Additional privilege priv-1 belongs to another user or project"
      ]);
    });

    test("additional privilege in another project", () => {
      const { failures } = run(
        scenario({ requests: [approvedRequest()], additionalPrivileges: [additionalPrivilege({ projectId: "P2" })] })
      );

      expect(additionalPrivilegeFailures(failures)).toEqual([
        "Additional privilege priv-1 belongs to another user or project"
      ]);
    });

    test("additional privilege already linked to a grant", () => {
      const { failures } = run(
        scenario({ requests: [approvedRequest()], additionalPrivileges: [additionalPrivilege({ grantId: "grant-x" })] })
      );

      expect(additionalPrivilegeFailures(failures)).toEqual([
        "Additional privilege priv-1 is already linked to grant grant-x"
      ]);
    });

    test("additional privilege shared by two requests flags both", () => {
      const { failures } = run(
        scenario({
          requests: [approvedRequest(), approvedRequest({ id: "req-2" })],
          additionalPrivileges: [additionalPrivilege()]
        })
      );

      expect(additionalPrivilegeFailures(failures, "req-1")).toEqual([
        "Additional privilege priv-1 is shared with requests req-2"
      ]);
      expect(additionalPrivilegeFailures(failures, "req-2")).toEqual([
        "Additional privilege priv-1 is shared with requests req-1"
      ]);
      expect(failures).toHaveLength(2);
    });

    test("additional privilege granting different permissions than the request asked for", () => {
      const { failures } = run(
        scenario({
          requests: [approvedRequest()],
          additionalPrivileges: [additionalPrivilege({ permissions: permissionsFor("dev", "/apps/other") })]
        })
      );

      expect(failures).toEqual([
        expect.objectContaining({ code: "privilege-permissions-mismatch", requestId: "req-1" })
      ]);
    });
  });

  describe("pending request scope", () => {
    const scopeFailures = (failures: TMigrationFailure[]) =>
      failures.filter((failure) => failure.code === "pending-request-out-of-scope").map((f) => f.message);

    test("request for an environment the policy does not cover", () => {
      const { failures } = run(scenario({ requests: [request({ permissions: permissionsFor("prod") })] }));

      expect(scopeFailures(failures)).toEqual([
        "The request is for environment 'prod', which the policy does not cover"
      ]);
      expect(failures).toHaveLength(1);
    });

    test("request for a secret path outside the policy path", () => {
      const { failures } = run(scenario({ requests: [request({ permissions: permissionsFor("dev", "/other/x") })] }));

      expect(scopeFailures(failures)).toEqual([
        "The request is for secret path '/other/x', which policy path '/apps/**' does not cover"
      ]);
      expect(failures).toHaveLength(1);
    });

    test("request whose permissions cannot be parsed", () => {
      const { failures } = run(
        scenario({ requests: [request({ permissions: [["read", "secrets", { environment: "dev" }]] })] })
      );

      expect(scopeFailures(failures)).toEqual([expect.stringMatching(/^The requested permissions are invalid:/)]);
      expect(failures).toHaveLength(1);
    });
  });

  describe("pending request state", () => {
    test("every step satisfied while the request is still pending", () => {
      const { failures } = run(scenario({ requests: [request()], reviews: [review("rv1", "u1", "approved", at(15))] }));

      expect(failures).toEqual([
        expect.objectContaining({
          code: "pending-request-state-mismatch",
          requestId: "req-1",
          message: "Every step already has enough approvals, yet the request is still pending"
        })
      ]);
    });

    test("approving reviewer who is an approver in two sequences", () => {
      const { failures } = run(
        scenario({
          approvers: [approver("u1"), approver("u1", { sequence: 2 }), approver("u2", { sequence: 2 })],
          requests: [request()],
          reviews: [review("rv1", "u1", "approved", at(15))]
        })
      );

      expect(failures).toContainEqual(
        expect.objectContaining({
          code: "pending-request-state-mismatch",
          requestId: "req-1",
          message: expect.stringContaining("is an approver in sequences 1, 2")
        })
      );
    });

    test("approval the global system would count but the legacy system does not", () => {
      const { failures } = run(
        scenario({
          approvers: [approver("u1"), approver("u2", { sequence: 2 })],
          requests: [request()],
          reviews: [review("rv1", "ux", "approved", at(15))]
        })
      );

      expect(codes(failures)).toEqual(["pending-request-state-mismatch", "pending-request-state-mismatch"]);
      expect(failures.map((failure) => failure.message)).toEqual([
        "The legacy approval system is waiting on sequence 1, the global approval system would wait on sequence 2",
        "Sequence 1 counts 0 approval(s) on the legacy approval system and 1 on the global approval system"
      ]);
    });
  });

  test("the ambiguous policy from the blackbox suite reports exactly its three failures", () => {
    const { failures } = run(
      scenario({
        policy: { ...scenario().policy, approvals: 2 },
        approvers: [approver("u1", { approvalsRequired: null }), approver("u2", { approvalsRequired: null })],
        requests: [request(), approvedRequest({ id: "req-2", privilegeId: "priv-2" })],
        reviews: [review("rv1", "u1", "approved", at(15))],
        additionalPrivileges: [additionalPrivilege({ id: "priv-2", actorUserId: "u1" })]
      })
    );

    expect(failures).toEqual([
      expect.objectContaining({ code: "ambiguous-required-approvals" }),
      expect.objectContaining({ code: "pending-request-state-mismatch", requestId: "req-1" }),
      expect.objectContaining({ code: "privilege-state-mismatch", requestId: "req-2" })
    ]);
  });
});
