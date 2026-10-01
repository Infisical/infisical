import { describe, expect, test } from "vitest";

import { buildSecretAccessPolicySteps } from "./secret-access-approval-bridge-fns";

type TApprovalsRequired = { numberOfApprovals: number; stepNumber: number }[];

const user = (id: string, sequence = 1) => ({ type: "user", id, sequence });
const group = (id: string, sequence = 1) => ({ type: "group", id, sequence });

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
