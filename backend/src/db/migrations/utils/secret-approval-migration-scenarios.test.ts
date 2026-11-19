// Lives under utils/ because tsdown compiles every src/db/migrations/*.ts into dist/db/migrations/,
// where knex would load a test file as a migration.
import { describe, expect, test } from "vitest";

import { TPolicyData, translatePolicy } from "../20261014120100_migrate-secret-approval-policies-to-global";
import { TLegacyApprover, TLegacyReview, TMigrationFailure } from "./approval-migration";

type TRequest = TPolicyData["requests"][number];

const T0 = new Date("2026-01-01T00:00:00Z");
const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);

const approver = (approverUserId: string): TLegacyApprover => ({ approverUserId, approverGroupId: null });
const groupApprover = (approverGroupId: string): TLegacyApprover => ({ approverUserId: null, approverGroupId });

const env = (envSlug: string, projectId = "P") => ({ envId: `env-${envSlug}`, envSlug, projectId, orgId: "O" });

const scenario = (overrides: Partial<TPolicyData> = {}): TPolicyData => ({
  policy: {
    id: "pol-1",
    name: "Prod changes",
    approvals: 1,
    secretPath: "/apps/**",
    enforcementLevel: "hard",
    allowedSelfApprovals: true,
    bypassForMachineIdentities: true,
    deletedAt: null,
    createdAt: at(0),
    updatedAt: at(1)
  },
  project: { id: "P", version: 3 },
  environments: [env("dev")],
  approvers: [approver("u1"), approver("u2")],
  bypassers: [],
  requests: [],
  reviews: [],
  committers: [{ id: "c1", username: "c1@example.com", email: "c1@example.com", firstName: "Cam", lastName: "Doe" }],
  committerIdentities: [],
  groupMembers: [],
  requestIdsAlreadyOnGlobal: [],
  ...overrides
});

const request = (overrides: Partial<TRequest> = {}): TRequest => ({
  id: "req-1",
  policyId: "pol-1",
  status: "open",
  hasMerged: false,
  conflicts: null,
  slug: "slug-1",
  folderId: "f1",
  isReplicated: false,
  committerUserId: "c1",
  committerIdentityId: null,
  statusChangedByUserId: null,
  bypassReason: null,
  commitMessage: "rotate api key",
  createdAt: at(10),
  updatedAt: at(10),
  ...overrides
});

const review = (
  id: string,
  reviewerUserId: string,
  status: string,
  createdAt: Date,
  { requestId = "req-1", comment = null as string | null } = {}
): TLegacyReview => ({ id, requestId, reviewerUserId, status, createdAt, comment });

const run = (data: TPolicyData) => translatePolicy(data);
const codes = (failures: TMigrationFailure[]) => failures.map((failure) => failure.code);

describe("secret approval migration scenarios that migrate", () => {
  test("translates a policy into one step with the policy's approvals, keeping its bypass flags", () => {
    const { failures, rows, projectId } = run(
      scenario({
        policy: { ...scenario().policy, approvals: 2, enforcementLevel: "soft", allowedSelfApprovals: false },
        environments: [env("dev"), env("prod")],
        approvers: [approver("u1"), groupApprover("g1"), approver("u2")],
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
      type: "secret-change",
      name: "Prod changes",
      isActive: true,
      maxRequestTtl: null,
      conditions: { version: 1, conditions: [] },
      constraints: { version: 1, constraints: { allowedSelfApprovals: false } },
      enforcementLevel: "soft",
      bypassForMachineIdentities: true,
      scopeType: null,
      scopeId: null,
      createdAt: at(0),
      updatedAt: at(1)
    });
    expect(rows.secretEnvironments).toEqual([
      { policyId: "pol-1", envId: "env-dev", secretPath: "/apps/**" },
      { policyId: "pol-1", envId: "env-prod", secretPath: "/apps/**" }
    ]);
    expect(rows.policySteps).toMatchObject([{ policyId: "pol-1", stepNumber: 1, requiredApprovals: 2 }]);
    expect(rows.policyStepApprovers).toEqual([
      { policyStepId: rows.policySteps[0].id, userId: "u1", groupId: null },
      { policyStepId: rows.policySteps[0].id, userId: "u2", groupId: null },
      { policyStepId: rows.policySteps[0].id, userId: null, groupId: "g1" }
    ]);
    expect(rows.bypassers).toEqual([
      { policyId: "pol-1", userId: "b1", groupId: null },
      { policyId: "pol-1", userId: null, groupId: "g2" }
    ]);
    expect(rows.requests).toEqual([]);
    expect(rows.secretChangeRequests).toEqual([]);
  });

  test("a machine identity bypass flag of false is copied rather than defaulted", () => {
    const { rows } = run(scenario({ policy: { ...scenario().policy, bypassForMachineIdentities: false } }));

    expect(rows.policy.bypassForMachineIdentities).toBe(false);
  });

  test("carries an open request over with its single step in progress and every review as an approval", () => {
    const { failures, rows } = run(
      scenario({
        approvers: [approver("u1"), groupApprover("g1")],
        groupMembers: [{ groupId: "g1", userId: "u3" }],
        requests: [request()],
        reviews: [
          review("rv1", "u1", "approved", at(15), { comment: "looks good" }),
          review("rv2", "u3", "rejected", at(16))
        ]
      })
    );

    expect(failures).toEqual([]);
    expect(rows.requests).toEqual([
      {
        id: "req-1",
        projectId: "P",
        organizationId: "O",
        policyId: "pol-1",
        requesterId: "c1",
        machineIdentityId: null,
        requesterName: "Cam Doe",
        requesterEmail: "c1@example.com",
        type: "secret-change",
        status: "open",
        justification: null,
        currentStep: 1,
        requestData: { version: 1, requestData: {} },
        expiresAt: null,
        scopeType: null,
        scopeId: null,
        createdAt: at(10),
        updatedAt: at(10)
      }
    ]);
    expect(rows.requestSteps).toEqual([
      {
        id: expect.any(String),
        requestId: "req-1",
        stepNumber: 1,
        name: null,
        status: "in-progress",
        requiredApprovals: 1,
        notifyApprovers: false,
        startedAt: at(10),
        completedAt: null
      }
    ]);
    const stepId = rows.requestSteps[0].id;
    expect(rows.eligibleApprovers).toEqual([
      { stepId, userId: "u1", groupId: null },
      { stepId, userId: null, groupId: "g1" }
    ]);
    expect(rows.approvals).toEqual([
      { stepId, approverUserId: "u1", decision: "approved", comment: "looks good", createdAt: at(15) },
      { stepId, approverUserId: "u3", decision: "rejected", comment: null, createdAt: at(16) }
    ]);
    expect(rows.secretChangeRequests).toEqual([
      {
        id: expect.any(String),
        approvalRequestId: "req-1",
        folderId: "f1",
        slug: "slug-1",
        hasMerged: false,
        conflicts: null,
        commitMessage: "rotate api key",
        bypassReason: null,
        isReplicated: false,
        statusChangedByUserId: null,
        createdAt: at(10),
        updatedAt: at(10)
      }
    ]);
  });

  test("keeps only the newest review row per reviewer", () => {
    const { failures, rows } = run(
      scenario({
        requests: [request()],
        reviews: [review("rv1", "u1", "rejected", at(15)), review("rv2", "u1", "approved", at(20))]
      })
    );

    expect(failures).toEqual([]);
    expect(rows.approvals).toEqual([expect.objectContaining({ approverUserId: "u1", decision: "approved" })]);
  });

  test("a review left by someone who is not an approver is carried over without failing", () => {
    const { failures, rows } = run(
      scenario({ requests: [request()], reviews: [review("rv1", "admin-1", "approved", at(15))] })
    );

    expect(failures).toEqual([]);
    expect(rows.approvals).toEqual([expect.objectContaining({ approverUserId: "admin-1", decision: "approved" })]);
  });

  test("a merged request keeps its merge outcome on the secret change row and closes on global", () => {
    const { failures, rows } = run(
      scenario({
        requests: [
          request({
            status: "close",
            hasMerged: true,
            conflicts: [{ op: "update", secretId: "s1" }],
            statusChangedByUserId: "u1",
            bypassReason: "incident 42 needs the key now",
            updatedAt: at(30)
          })
        ],
        reviews: [review("rv1", "u1", "approved", at(15))]
      })
    );

    expect(failures).toEqual([]);
    expect(rows.requests[0]).toMatchObject({ status: "close", currentStep: 1, updatedAt: at(30) });
    expect(rows.requestSteps[0]).toMatchObject({ status: "in-progress", completedAt: null });
    expect(rows.secretChangeRequests[0]).toMatchObject({
      hasMerged: true,
      conflicts: JSON.stringify([{ op: "update", secretId: "s1" }]),
      statusChangedByUserId: "u1",
      bypassReason: "incident 42 needs the key now",
      updatedAt: at(30)
    });
  });

  test("a closed unmerged request closes on global without a merge outcome", () => {
    const { failures, rows } = run(
      scenario({ requests: [request({ status: "close", statusChangedByUserId: "c1", updatedAt: at(12) })] })
    );

    expect(failures).toEqual([]);
    expect(rows.requests[0]).toMatchObject({ status: "close" });
    expect(rows.secretChangeRequests[0]).toMatchObject({ hasMerged: false, statusChangedByUserId: "c1" });
  });

  test("a request opened by a machine identity names the identity", () => {
    const { failures, rows } = run(
      scenario({
        committerIdentities: [{ id: "i1", name: "deploy-bot" }],
        requests: [request({ committerUserId: null, committerIdentityId: "i1" })]
      })
    );

    expect(failures).toEqual([]);
    expect(rows.requests[0]).toMatchObject({
      requesterId: null,
      machineIdentityId: "i1",
      requesterName: "deploy-bot",
      requesterEmail: ""
    });
  });

  test("a request whose committer was deleted migrates with no requester", () => {
    const { failures, rows } = run(scenario({ requests: [request({ committerUserId: null })] }));

    expect(failures).toEqual([]);
    expect(rows.requests[0]).toMatchObject({
      requesterId: null,
      machineIdentityId: null,
      requesterName: "",
      requesterEmail: ""
    });
  });

  test("a committer without a name is named by their username", () => {
    const { rows } = run(
      scenario({
        committers: [{ id: "c1", username: "c1@example.com", email: null, firstName: null, lastName: null }],
        requests: [request()]
      })
    );

    expect(rows.requests[0]).toMatchObject({ requesterName: "c1@example.com", requesterEmail: "" });
  });

  test("a policy whose only approver group has no members migrates with that group as its approver", () => {
    const { failures, rows } = run(scenario({ approvers: [groupApprover("g1")] }));

    expect(failures).toEqual([]);
    expect(rows.policySteps).toMatchObject([{ policyId: "pol-1", stepNumber: 1, requiredApprovals: 1 }]);
    expect(rows.policyStepApprovers).toEqual([{ policyStepId: rows.policySteps[0].id, userId: null, groupId: "g1" }]);
  });
});

describe("secret approval migration scenarios that fail the checks", () => {
  test("a policy on a project that is not V3", () => {
    const { failures } = run(scenario({ project: { id: "P", version: 2 } }));

    expect(codes(failures)).toEqual(["project-not-v3"]);
    expect(failures[0].message).toContain("version 2");
  });

  test("a policy whose project could not be read", () => {
    const { failures } = run(scenario({ project: null }));

    expect(codes(failures)).toEqual(["project-not-v3"]);
  });

  test("a policy without environments", () => {
    const { failures } = run(scenario({ environments: [] }));

    expect(codes(failures)).toEqual(["no-environments"]);
  });

  test("a policy without approvers", () => {
    const { failures } = run(scenario({ approvers: [] }));

    expect(codes(failures)).toEqual(["no-approvers"]);
  });

  test("a policy that requires more approvals than it has user approvers", () => {
    const { failures } = run(scenario({ policy: { ...scenario().policy, approvals: 3 } }));

    expect(codes(failures)).toEqual(["required-approvals-exceed-approvers"]);
  });

  test("a policy that requires zero approvals", () => {
    const { failures } = run(scenario({ policy: { ...scenario().policy, approvals: 0 } }));

    expect(codes(failures)).toEqual(["invalid-approvals"]);
  });

  test("a request with a status the global approval system does not have", () => {
    const { failures } = run(scenario({ requests: [request({ status: "merged" })] }));

    expect(failures).toEqual([
      {
        code: "unknown-request-status",
        requestId: "req-1",
        message: "Status 'merged' has no equivalent on the global approval system"
      }
    ]);
  });

  test("a review with a status other than approved or rejected", () => {
    const { failures } = run(scenario({ requests: [request()], reviews: [review("rv1", "u1", "pending", at(15))] }));

    expect(codes(failures)).toEqual(["unknown-review-status"]);
  });

  test("a request that names both a committer user and a committer identity", () => {
    const { failures } = run(
      scenario({
        committerIdentities: [{ id: "i1", name: "deploy-bot" }],
        requests: [request({ committerUserId: "c1", committerIdentityId: "i1" })]
      })
    );

    expect(codes(failures)).toEqual(["ambiguous-committer"]);
    expect(failures[0]).toMatchObject({ requestId: "req-1" });
  });

  test("a request that already exists on the global approval system", () => {
    const { failures } = run(scenario({ requests: [request()], requestIdsAlreadyOnGlobal: ["req-1"] }));

    expect(codes(failures)).toEqual(["request-already-migrated"]);
  });
});
