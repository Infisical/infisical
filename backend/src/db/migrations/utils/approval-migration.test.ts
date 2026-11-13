import { Knex } from "knex";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { logger } from "@app/lib/logger";

import {
  buildApprovalSteps,
  buildBypasserRows,
  buildGlobalPolicyRow,
  buildPolicyEnvironmentRows,
  buildPolicyStepRows,
  buildRequestStepRows,
  checkPendingApprovalState,
  checkPolicyEnvironments,
  checkRequestsAlreadyMigrated,
  checkReviewStatuses,
  logFailedChecks,
  replayReviews,
  runLegacyPolicyMigration,
  TGroupMember,
  TLegacyApprover,
  TLegacyReview,
  TMigrationFailure,
  TPolicyEnvironment,
  TPolicyOutcome
} from "./approval-migration";

vi.mock("@app/lib/logger", () => ({
  initLogger: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

const T0 = new Date("2026-01-01T00:00:00Z");
const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);

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

const review = (
  id: string,
  reviewerUserId: string,
  status: string,
  createdAt: Date,
  comment?: string | null
): TLegacyReview => ({ id, requestId: "req-1", reviewerUserId, status, createdAt, comment });

const env = (envId: string, projectId = "P", orgId = "O"): TPolicyEnvironment => ({
  envId,
  envSlug: envId,
  projectId,
  orgId
});

const codes = (failures: TMigrationFailure[]) => failures.map((failure) => failure.code);

const stepsOf = (approvers: TLegacyApprover[], groupMembers: TGroupMember[] = [], approvals = 1) => {
  const failures: TMigrationFailure[] = [];
  const steps = buildApprovalSteps({ policy: { approvals }, approvers, groupMembers }, failures);
  expect(failures).toEqual([]);
  return steps;
};

const legacyTables = {
  legacyPolicies: "legacy_policies",
  legacyApprovers: "legacy_approvers",
  legacyBypassers: "legacy_bypassers",
  legacyEnvironments: "legacy_environments",
  legacyReviewers: "legacy_reviewers"
} as unknown as Parameters<typeof runLegacyPolicyMigration>[1]["tables"];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("logFailedChecks", () => {
  test("writes one warning carrying every reason in the searchable format", () => {
    const failures: TMigrationFailure[] = [
      { code: "a", message: "m1" },
      { code: "b", message: "m2", requestId: "r" }
    ];

    logFailedChecks({ logPrefix: "pfx", policyId: "p1", failures });

    expect(logger.warn).toHaveBeenCalledTimes(1);
    const [context, message] = vi.mocked(logger.warn).mock.calls[0] as [unknown, string];
    expect(context).toEqual({ policyId: "p1", projectId: undefined, failures });
    expect(message).toBe(
      "pfx: policy not migrated, it stays on the legacy approval system [policyId=p1] [projectId=unknown] [failedChecks=2] reasons=[a: m1; b [requestId=r]: m2]"
    );
  });

  test("prints the project when it is known", () => {
    logFailedChecks({ logPrefix: "pfx", policyId: "p1", projectId: "P", failures: [{ code: "a", message: "m" }] });

    expect(vi.mocked(logger.warn).mock.calls[0][1]).toContain("[projectId=P] [failedChecks=1]");
  });
});

describe("checkPolicyEnvironments", () => {
  test("returns the project and org of the policy's environments", () => {
    const failures: TMigrationFailure[] = [];

    expect(checkPolicyEnvironments([env("dev"), env("prod")], failures)).toEqual({ projectId: "P", orgId: "O" });
    expect(failures).toEqual([]);
  });

  test("fails a policy with no environments", () => {
    const failures: TMigrationFailure[] = [];

    expect(checkPolicyEnvironments([], failures)).toEqual({ projectId: undefined, orgId: undefined });
    expect(codes(failures)).toEqual(["no-environments"]);
  });

  test("fails a policy whose environments belong to several projects", () => {
    const failures: TMigrationFailure[] = [];

    checkPolicyEnvironments([env("dev", "P1"), env("prod", "P2")], failures);

    expect(codes(failures)).toEqual(["environments-span-projects"]);
    expect(failures[0].message).toContain("P1, P2");
  });
});

describe("buildApprovalSteps", () => {
  test("groups approvers by sequence in ascending order", () => {
    const steps = stepsOf([approver("u3", { sequence: 3 }), approver("u1"), approver("u2")]);

    expect(steps.map((step) => step.sequence)).toEqual([1, 3]);
    expect(steps[0].userIds).toEqual(["u1", "u2"]);
    expect(steps[1].userIds).toEqual(["u3"]);
  });

  test("treats a missing sequence as the first one", () => {
    const steps = stepsOf([approver("u1", { sequence: null }), approver("u2", { sequence: undefined })]);

    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ sequence: 1, requiredApprovals: 1, userIds: ["u1", "u2"] });
  });

  test("fails a policy without approvers", () => {
    const failures: TMigrationFailure[] = [];

    const steps = buildApprovalSteps({ policy: { approvals: 1 }, approvers: [], groupMembers: [] }, failures);

    expect(steps).toEqual([]);
    expect(codes(failures)).toEqual(["no-approvers"]);
  });

  test("fails when approvers of one sequence disagree on the approvals required", () => {
    const failures: TMigrationFailure[] = [];

    const steps = buildApprovalSteps(
      {
        policy: { approvals: 1 },
        approvers: [approver("u1", { approvalsRequired: 2 }), approver("u2", { approvalsRequired: null })],
        groupMembers: []
      },
      failures
    );

    expect(codes(failures)).toEqual(["step-approvals-disagree"]);
    expect(failures[0].message).toContain("(2, unset)");
    expect(steps[0].requiredApprovals).toBe(2);
  });

  test("fails when the first sequence has no approvalsRequired while the policy asks for more than one", () => {
    const failures: TMigrationFailure[] = [];

    const steps = buildApprovalSteps(
      {
        policy: { approvals: 2 },
        approvers: [approver("u1", { approvalsRequired: null }), approver("u2", { approvalsRequired: null })],
        groupMembers: []
      },
      failures
    );

    expect(codes(failures)).toEqual(["ambiguous-required-approvals"]);
    expect(steps[0].requiredApprovals).toBe(1);
  });

  test("does not treat a later sequence without approvalsRequired as ambiguous", () => {
    const steps = stepsOf(
      [
        approver("u1", { approvalsRequired: 2 }),
        approver("u2", { approvalsRequired: 2 }),
        approver("u3", { sequence: 2, approvalsRequired: null })
      ],
      [],
      2
    );

    expect(steps.map((step) => step.requiredApprovals)).toEqual([2, 1]);
  });

  test("fails when a sequence of user approvers cannot reach its required approvals", () => {
    const failures: TMigrationFailure[] = [];

    buildApprovalSteps(
      { policy: { approvals: 1 }, approvers: [approver("u1", { approvalsRequired: 2 })], groupMembers: [] },
      failures
    );

    expect(codes(failures)).toEqual(["required-approvals-exceed-approvers"]);
    expect(failures[0].message).toContain("requires 2 approvals but has only 1 user approver");
  });

  test("lets a group cover the required approvals", () => {
    const steps = stepsOf(
      [approver("u1", { approvalsRequired: 2 }), groupApprover("g1", { approvalsRequired: 2 })],
      [{ groupId: "g1", userId: "u2" }]
    );

    expect(steps[0].eligibleUserIds).toEqual(new Set(["u1", "u2"]));
  });

  test("keeps a sequence whose only approvers are groups without members", () => {
    const failures: TMigrationFailure[] = [];

    const steps = buildApprovalSteps(
      { policy: { approvals: 1 }, approvers: [groupApprover("g1")], groupMembers: [] },
      failures
    );

    expect(failures).toEqual([]);
    expect(steps[0]).toMatchObject({ groupIds: ["g1"], eligibleUserIds: new Set() });
  });

  test("dedupes repeated users and groups and merges group members into the eligible set", () => {
    const steps = stepsOf(
      [approver("u1"), approver("u1"), groupApprover("g1"), groupApprover("g1")],
      [
        { groupId: "g1", userId: "u1" },
        { groupId: "g1", userId: "u2" }
      ]
    );

    expect(steps[0]).toMatchObject({
      userIds: ["u1"],
      groupIds: ["g1"],
      eligibleUserIds: new Set(["u1", "u2"])
    });
  });

  test("builds one step from approvers normalized to the policy's approvals, as a system without sequences does", () => {
    const steps = stepsOf(
      [
        approver("u1", { approvalsRequired: 3 }),
        approver("u2", { approvalsRequired: 3 }),
        groupApprover("g1", { approvalsRequired: 3 })
      ],
      [{ groupId: "g1", userId: "u3" }],
      3
    );

    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ sequence: 1, requiredApprovals: 3, eligibleUserIds: new Set(["u1", "u2", "u3"]) });
  });
});

describe("replayReviews", () => {
  const twoSteps = () => stepsOf([approver("u1"), approver("u2", { sequence: 2 })]);

  test("starts at the first step and attributes nothing when there are no steps", () => {
    expect(replayReviews([], [review("r1", "u1", "approved", at(1))])).toEqual({
      approvedCounts: [],
      completedAt: [],
      attributed: [],
      currentIndex: 0
    });
  });

  test("advances to the next step once a step has enough approvals", () => {
    const replay = replayReviews(twoSteps(), [review("r1", "u1", "approved", at(1))]);

    expect(replay).toMatchObject({ approvedCounts: [1, 0], completedAt: [at(1), null], currentIndex: 1 });
    expect(replay.attributed).toEqual([{ review: expect.objectContaining({ id: "r1" }), stepIndex: 0 }]);
  });

  test("replays reviews in creation order, then by id, and stays on the last step when all are satisfied", () => {
    const replay = replayReviews(twoSteps(), [
      review("b", "u2", "approved", at(2)),
      review("a", "u1", "approved", at(1)),
      review("c", "u2", "rejected", at(2))
    ]);

    expect(replay.attributed.map(({ review: r, stepIndex }) => [r.id, stepIndex])).toEqual([
      ["a", 0],
      ["b", 1],
      ["c", 1]
    ]);
    expect(replay).toMatchObject({ approvedCounts: [1, 1], completedAt: [at(1), at(2)], currentIndex: 1 });
  });

  test("attributes an approval to the step the reviewer is eligible for", () => {
    const replay = replayReviews(twoSteps(), [review("r1", "u2", "approved", at(1))]);

    expect(replay.attributed[0].stepIndex).toBe(1);
    expect(replay).toMatchObject({ approvedCounts: [0, 1], currentIndex: 0 });
  });

  test("counts an approval from a reviewer eligible nowhere on the current step", () => {
    const replay = replayReviews(twoSteps(), [review("r1", "ux", "approved", at(1))]);

    expect(replay.attributed[0].stepIndex).toBe(0);
    expect(replay).toMatchObject({ approvedCounts: [1, 0], currentIndex: 1 });
  });

  test("attributes a rejection without counting it", () => {
    const replay = replayReviews(twoSteps(), [review("r1", "u1", "rejected", at(1))]);

    expect(replay.attributed[0].stepIndex).toBe(0);
    expect(replay).toMatchObject({ approvedCounts: [0, 0], completedAt: [null, null], currentIndex: 0 });
  });
});

describe("checkPendingApprovalState", () => {
  const check = (steps: ReturnType<typeof stepsOf>, reviews: TLegacyReview[], failWhenAllStepsSatisfied = true) => {
    const failures: TMigrationFailure[] = [];
    checkPendingApprovalState("req-1", steps, reviews, replayReviews(steps, reviews), failures, {
      failWhenAllStepsSatisfied
    });
    return failures;
  };

  test("reports a policy without steps as skipped", () => {
    const failures = check([], []);

    expect(failures).toEqual([
      { code: "pending-request-state-mismatch", requestId: "req-1", message: expect.stringMatching(/^skipped:/) }
    ]);
  });

  test("passes a pending request whose state both systems agree on", () => {
    const steps = stepsOf([approver("u1"), approver("u2", { sequence: 2 })]);

    expect(check(steps, [review("r1", "u1", "approved", at(1))])).toEqual([]);
  });

  test("fails when an approving reviewer is an approver in several sequences", () => {
    const steps = stepsOf([approver("u1"), approver("u1", { sequence: 2 }), approver("u2", { sequence: 2 })]);

    const failures = check(steps, [review("r1", "u1", "approved", at(1))]);

    expect(failures).toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining("sequences 1, 2, so which step the approval counts toward is ambiguous")
      })
    );
  });

  test("fails a request that is still pending with every step satisfied, unless the caller allows it", () => {
    const steps = stepsOf([approver("u1")]);
    const reviews = [review("r1", "u1", "approved", at(1))];

    expect(check(steps, reviews, true).map((failure) => failure.message)).toEqual([
      "Every step already has enough approvals, yet the request is still pending"
    ]);
    expect(check(steps, reviews, false)).toEqual([]);
  });

  test("fails when an approval the global system would count is one the legacy system ignores", () => {
    const steps = stepsOf([approver("u1"), approver("u2", { sequence: 2 })]);

    const failures = check(steps, [review("r1", "ux", "approved", at(1))]);

    expect(failures.map((failure) => failure.message)).toEqual([
      "The legacy approval system is waiting on sequence 1, the global approval system would wait on sequence 2",
      "Sequence 1 counts 0 approval(s) on the legacy approval system and 1 on the global approval system"
    ]);
  });

  test("counts a user named directly and through a group once", () => {
    const steps = stepsOf(
      [approver("u1", { approvalsRequired: 2 }), groupApprover("g1", { approvalsRequired: 2 })],
      [
        { groupId: "g1", userId: "u1" },
        { groupId: "g1", userId: "u2" }
      ]
    );

    expect(check(steps, [review("r1", "u1", "approved", at(1))])).toEqual([]);
  });
});

describe("checkReviewStatuses", () => {
  test("accepts approved and rejected reviews", () => {
    const failures: TMigrationFailure[] = [];

    checkReviewStatuses(
      "req-1",
      [review("a", "u1", "approved", at(1)), review("b", "u2", "rejected", at(2))],
      failures
    );

    expect(failures).toEqual([]);
  });

  test("fails any other review status", () => {
    const failures: TMigrationFailure[] = [];

    checkReviewStatuses("req-1", [review("a", "u1", "pending", at(1))], failures);

    expect(failures).toEqual([
      { code: "unknown-review-status", requestId: "req-1", message: "Review by u1 has status 'pending'" }
    ]);
  });
});

describe("checkRequestsAlreadyMigrated", () => {
  test("passes when nothing is on the global system yet", () => {
    const failures: TMigrationFailure[] = [];

    checkRequestsAlreadyMigrated([], failures);

    expect(failures).toEqual([]);
  });

  test("names every request that already exists on the global system", () => {
    const failures: TMigrationFailure[] = [];

    checkRequestsAlreadyMigrated(["a", "b"], failures);

    expect(codes(failures)).toEqual(["request-already-migrated"]);
    expect(failures[0].message).toContain("Requests a, b already exist");
  });
});

describe("row builders", () => {
  const policy = { id: "pol-1", name: "Prod", enforcementLevel: "hard", createdAt: at(0), updatedAt: at(5) };

  test("buildGlobalPolicyRow fills the shared columns and takes the type-specific ones from the caller", () => {
    expect(
      buildGlobalPolicyRow({
        policy,
        projectId: "P",
        orgId: "O",
        type: "secret-change",
        conditions: { version: 1, conditions: [] },
        constraints: { version: 1, constraints: { allowedSelfApprovals: true } },
        bypassForMachineIdentities: true
      })
    ).toEqual({
      id: "pol-1",
      projectId: "P",
      organizationId: "O",
      type: "secret-change",
      name: "Prod",
      isActive: true,
      maxRequestTtl: null,
      conditions: { version: 1, conditions: [] },
      constraints: { version: 1, constraints: { allowedSelfApprovals: true } },
      enforcementLevel: "hard",
      bypassForMachineIdentities: true,
      scopeType: null,
      scopeId: null,
      createdAt: at(0),
      updatedAt: at(5)
    });
  });

  test("buildPolicyEnvironmentRows repeats the policy path for every environment", () => {
    expect(buildPolicyEnvironmentRows("pol-1", [env("dev"), env("prod")], "/apps/**")).toEqual([
      { policyId: "pol-1", envId: "dev", secretPath: "/apps/**" },
      { policyId: "pol-1", envId: "prod", secretPath: "/apps/**" }
    ]);
  });

  test("buildPolicyStepRows numbers steps and links approvers to their step", () => {
    const steps = stepsOf(
      [
        approver("u1"),
        groupApprover("g1"),
        approver("u2", { sequence: 5, approvalsRequired: 2 }),
        approver("u3", { sequence: 5, approvalsRequired: 2 })
      ],
      [{ groupId: "g1", userId: "u9" }]
    );

    const { policySteps, policyStepApprovers } = buildPolicyStepRows("pol-1", steps);

    expect(policySteps).toEqual([
      { id: expect.any(String), policyId: "pol-1", stepNumber: 1, requiredApprovals: 1 },
      { id: expect.any(String), policyId: "pol-1", stepNumber: 2, requiredApprovals: 2 }
    ]);
    expect(policyStepApprovers).toEqual([
      { policyStepId: policySteps[0].id, userId: "u1", groupId: null },
      { policyStepId: policySteps[0].id, userId: null, groupId: "g1" },
      { policyStepId: policySteps[1].id, userId: "u2", groupId: null },
      { policyStepId: policySteps[1].id, userId: "u3", groupId: null }
    ]);
  });

  test("buildBypasserRows dedupes and splits users from groups", () => {
    expect(
      buildBypasserRows("pol-1", [
        { bypasserUserId: "u1" },
        { bypasserUserId: "u1" },
        { bypasserGroupId: "g1" },
        { bypasserUserId: null, bypasserGroupId: null }
      ])
    ).toEqual([
      { policyId: "pol-1", userId: "u1", groupId: null },
      { policyId: "pol-1", userId: null, groupId: "g1" }
    ]);
  });

  describe("buildRequestStepRows", () => {
    const threeSteps = () =>
      stepsOf(
        [approver("u1"), groupApprover("g1", { sequence: 2 }), approver("u3", { sequence: 3 })],
        [{ groupId: "g1", userId: "u2" }]
      );

    test("completes every step of an approved request, chaining the timestamps", () => {
      const steps = threeSteps();
      const reviews = [review("r1", "u1", "approved", at(1))];

      const { requestSteps } = buildRequestStepRows({
        requestId: "req-1",
        steps,
        replay: replayReviews(steps, reviews),
        isApprovedLike: true,
        requestCreatedAt: at(0),
        fallbackCompletedAt: at(9)
      });

      expect(requestSteps.map(({ status, startedAt, completedAt }) => [status, startedAt, completedAt])).toEqual([
        ["completed", at(0), at(1)],
        ["completed", at(1), at(9)],
        ["completed", at(9), at(9)]
      ]);
    });

    test("marks the replayed step in progress and the rest pending on a live request", () => {
      const steps = threeSteps();
      const reviews = [review("r1", "u1", "approved", at(1))];

      const { requestSteps, eligibleApprovers } = buildRequestStepRows({
        requestId: "req-1",
        steps,
        replay: replayReviews(steps, reviews),
        isApprovedLike: false,
        requestCreatedAt: at(0),
        fallbackCompletedAt: at(9)
      });

      expect(requestSteps).toEqual([
        expect.objectContaining({
          requestId: "req-1",
          stepNumber: 1,
          status: "completed",
          startedAt: at(0),
          completedAt: at(1)
        }),
        expect.objectContaining({ stepNumber: 2, status: "in-progress", startedAt: at(1), completedAt: null }),
        expect.objectContaining({ stepNumber: 3, status: "pending", startedAt: null, completedAt: null })
      ]);
      expect(requestSteps[0]).toMatchObject({ name: null, requiredApprovals: 1, notifyApprovers: false });
      expect(eligibleApprovers).toEqual([
        { stepId: requestSteps[0].id, userId: "u1", groupId: null },
        { stepId: requestSteps[1].id, userId: null, groupId: "g1" },
        { stepId: requestSteps[2].id, userId: "u3", groupId: null }
      ]);
    });

    test("keeps a single step in progress when the request is not approved-like, even once satisfied", () => {
      const steps = stepsOf([approver("u1")]);
      const reviews = [review("r1", "u1", "approved", at(1), "looks good")];

      const { requestSteps, approvals } = buildRequestStepRows({
        requestId: "req-1",
        steps,
        replay: replayReviews(steps, reviews),
        isApprovedLike: false,
        requestCreatedAt: at(0),
        fallbackCompletedAt: at(9)
      });

      expect(requestSteps).toEqual([
        expect.objectContaining({ status: "in-progress", startedAt: at(0), completedAt: null })
      ]);
      expect(approvals).toEqual([
        {
          stepId: requestSteps[0].id,
          approverUserId: "u1",
          decision: "approved",
          comment: "looks good",
          createdAt: at(1)
        }
      ]);
    });

    test("maps approvals to the step they were attributed to and defaults the comment to null", () => {
      const steps = threeSteps();
      const reviews = [review("a", "u1", "approved", at(1)), review("b", "u2", "rejected", at(2))];

      const { requestSteps, approvals } = buildRequestStepRows({
        requestId: "req-1",
        steps,
        replay: replayReviews(steps, reviews),
        isApprovedLike: false,
        requestCreatedAt: at(0),
        fallbackCompletedAt: at(9)
      });

      expect(approvals).toEqual([
        { stepId: requestSteps[0].id, approverUserId: "u1", decision: "approved", comment: null, createdAt: at(1) },
        { stepId: requestSteps[1].id, approverUserId: "u2", decision: "rejected", comment: null, createdAt: at(2) }
      ]);
    });

    test("writes nothing for a policy without steps", () => {
      expect(
        buildRequestStepRows({
          requestId: "req-1",
          steps: [],
          replay: replayReviews([], [review("a", "u1", "approved", at(1))]),
          isApprovedLike: false,
          requestCreatedAt: at(0),
          fallbackCompletedAt: at(9)
        })
      ).toEqual({ requestSteps: [], eligibleApprovers: [], approvals: [] });
    });
  });
});

describe("runLegacyPolicyMigration", () => {
  const fakeKnex = (batches: string[][]) => {
    const pending = [...batches];
    const builder: Record<string, unknown> = {};
    ["whereNull", "whereNotExists", "modify", "orderBy", "limit"].forEach((method) => {
      builder[method] = () => builder;
    });
    builder.pluck = () => Promise.resolve(pending.shift() ?? []);
    return Object.assign(() => builder, {
      raw: (sql: string) => sql,
      transaction: (run: (tx: unknown) => Promise<TPolicyOutcome>) => run({})
    }) as unknown as Knex;
  };

  test("counts every outcome, keeps going past a locked or failing policy, and reports the totals", async () => {
    const outcomes: Record<string, () => Promise<TPolicyOutcome>> = {
      p1: () => Promise.resolve("migrated"),
      p2: () => Promise.reject(Object.assign(new Error("lock"), { code: "55P03" })),
      p3: () => Promise.reject(new Error("boom")),
      p4: () => Promise.resolve("failedChecks"),
      p5: () => Promise.resolve("skipped")
    };
    const migratePolicy = vi.fn((_tx: Knex, policyId: string) => outcomes[policyId]());

    await runLegacyPolicyMigration(
      fakeKnex([
        ["p1", "p2", "p3"],
        ["p4", "p5"]
      ]),
      {
        tables: legacyTables,
        logPrefix: "pfx",
        migratePolicy
      }
    );

    expect(migratePolicy.mock.calls.map(([, policyId]) => policyId)).toEqual(["p1", "p2", "p3", "p4", "p5"]);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("[policyId=p2] reasons=[locked:"));
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ message: "boom" }),
      expect.stringContaining("[policyId=p3] reasons=[unexpected error]")
    );
    expect(logger.info).toHaveBeenCalledWith(
      "pfx: migrated 1 policies, 1 failed checks, 1 were locked, 1 failed with an error, 1 were already migrated or deleted"
    );
  });

  test("does nothing when no legacy policy is left to migrate", async () => {
    const migratePolicy = vi.fn(() => Promise.resolve("migrated" as TPolicyOutcome));

    await runLegacyPolicyMigration(fakeKnex([]), { tables: legacyTables, logPrefix: "pfx", migratePolicy });

    expect(migratePolicy).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("migrated 0 policies"));
  });
});
