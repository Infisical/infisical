import { describe, expect, test } from "vitest";

import { BadRequestError } from "@app/lib/errors";
import { ApproverType } from "@app/services/approval-policy/approval-policy-enums";

import { buildSecretAccessPolicySteps } from "./secret-access-approval-global-policy-bridge-fns";

type TApprovalsRequired = { numberOfApprovals: number; stepNumber: number }[];

const user = (id: string, sequence = 1) => ({ type: ApproverType.User, id, sequence });
const group = (id: string, sequence = 1) => ({ type: ApproverType.Group, id, sequence });

// Mirrors the legacy path: the approver row stores the step's numberOfApprovals (null when the step has no
// entry), and review reads it as `approvalsRequired || 1`.
const legacyRequiredApprovals = (sequence: number, approvalsRequired?: TApprovalsRequired) =>
  approvalsRequired?.find((el) => el.stepNumber === sequence)?.numberOfApprovals || 1;

describe("buildSecretAccessPolicySteps", () => {
  test("uses the step's numberOfApprovals when present", () => {
    const steps = buildSecretAccessPolicySteps(
      [user("a"), user("b"), user("c")],
      [{ stepNumber: 1, numberOfApprovals: 2 }]
    );

    expect(steps).toHaveLength(1);
    expect(steps[0].requiredApprovals).toBe(2);
    expect(steps[0].approvers.map((el) => el.id)).toEqual(["a", "b", "c"]);
  });

  test("a step with no approvalsRequired entry needs one approval", () => {
    const steps = buildSecretAccessPolicySteps([user("a"), user("b"), user("c")]);

    expect(steps).toEqual([expect.objectContaining({ requiredApprovals: 1 })]);
  });

  test("returns steps in sequence order with their own requirement", () => {
    const steps = buildSecretAccessPolicySteps(
      [user("b", 2), user("c", 2), user("a", 1)],
      [
        { stepNumber: 2, numberOfApprovals: 2 },
        { stepNumber: 1, numberOfApprovals: 1 }
      ]
    );

    expect(steps.map((step) => step.requiredApprovals)).toEqual([1, 2]);
    expect(steps[0].approvers.map((el) => el.id)).toEqual(["a"]);
    expect(steps[1].approvers.map((el) => el.id)).toEqual(["b", "c"]);
  });

  test("user and group approvers in the same sequence share one step", () => {
    const steps = buildSecretAccessPolicySteps([user("a"), group("g")], [{ stepNumber: 1, numberOfApprovals: 2 }]);

    expect(steps).toHaveLength(1);
    expect(steps[0].approvers).toEqual([user("a"), group("g")]);
    expect(steps[0].requiredApprovals).toBe(2);
  });

  test("the same user may approve in two different steps", () => {
    const steps = buildSecretAccessPolicySteps(
      [user("a", 1), user("b", 1), user("b", 2)],
      [
        { stepNumber: 1, numberOfApprovals: 2 },
        { stepNumber: 2, numberOfApprovals: 1 }
      ]
    );

    expect(steps).toHaveLength(2);
    expect(steps[0].approvers.map((el) => el.id)).toEqual(["a", "b"]);
    expect(steps[0].requiredApprovals).toBe(2);
    expect(steps[1].approvers.map((el) => el.id)).toEqual(["b"]);
    expect(steps[1].requiredApprovals).toBe(1);
  });

  test("the same approver listed twice in one step counts once", () => {
    const steps = buildSecretAccessPolicySteps([user("a"), user("a"), group("g"), group("g")]);

    expect(steps[0].approvers).toEqual([user("a"), group("g")]);
  });

  test("a step that requires more approvals than it has user approvers is rejected", () => {
    expect(() =>
      buildSecretAccessPolicySteps(
        [user("a", 1), user("b", 1), user("c", 2)],
        [
          { stepNumber: 1, numberOfApprovals: 2 },
          { stepNumber: 2, numberOfApprovals: 2 }
        ]
      )
    ).toThrow(BadRequestError);
    expect(() =>
      buildSecretAccessPolicySteps([user("a", 1), user("c", 2)], [{ stepNumber: 2, numberOfApprovals: 3 }])
    ).toThrow("Step 2 requires 3 approvals but only has 1 approver.");
  });

  test("a duplicate approver does not count toward the step's requirement", () => {
    expect(() =>
      buildSecretAccessPolicySteps([user("a"), user("a")], [{ stepNumber: 1, numberOfApprovals: 2 }])
    ).toThrow(BadRequestError);
  });

  test("a step containing a group approver is never rejected for its size", () => {
    const steps = buildSecretAccessPolicySteps([user("a"), group("g")], [{ stepNumber: 1, numberOfApprovals: 10 }]);

    expect(steps[0].requiredApprovals).toBe(10);
  });

  test.each([
    { name: "single step, no entries", approvers: [user("a"), user("b")], approvalsRequired: undefined },
    {
      name: "single step with an entry",
      approvers: [user("a"), user("b"), user("c")],
      approvalsRequired: [{ stepNumber: 1, numberOfApprovals: 2 }]
    },
    {
      name: "two steps, entry only for the first",
      approvers: [user("a", 1), user("b", 2), user("c", 2)],
      approvalsRequired: [{ stepNumber: 1, numberOfApprovals: 1 }]
    },
    {
      name: "two steps, entry only for the second",
      approvers: [user("a", 1), group("g", 2)],
      approvalsRequired: [{ stepNumber: 2, numberOfApprovals: 3 }]
    },
    {
      name: "zero numberOfApprovals",
      approvers: [user("a"), user("b")],
      approvalsRequired: [{ stepNumber: 1, numberOfApprovals: 0 }]
    },
    {
      name: "entry for a step that has no approvers",
      approvers: [user("a", 1)],
      approvalsRequired: [{ stepNumber: 2, numberOfApprovals: 2 }]
    }
  ])("matches the legacy effective requirement: $name", ({ approvers, approvalsRequired }) => {
    const steps = buildSecretAccessPolicySteps(approvers, approvalsRequired);
    const sequences = [...new Set(approvers.map((el) => el.sequence))].sort((a, b) => a - b);

    expect(steps.map((step) => step.requiredApprovals)).toEqual(
      sequences.map((sequence) => legacyRequiredApprovals(sequence, approvalsRequired))
    );
  });
});
