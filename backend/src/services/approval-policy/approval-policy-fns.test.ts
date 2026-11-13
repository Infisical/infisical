import { describe, expect, it } from "vitest";

import { BadRequestError } from "@app/lib/errors";

import { ApproverType } from "./approval-policy-enums";
import { assertPolicyStepsCanApprove } from "./approval-policy-fns";

const user = (id: string) => ({ type: ApproverType.User, id });
const group = (id: string) => ({ type: ApproverType.Group, id });

const USER_A = "7d3f9c1a-0b52-4c44-9a1e-1f5e8c2b7a01";
const USER_B = "7d3f9c1a-0b52-4c44-9a1e-1f5e8c2b7a02";
const GROUP_A = "7d3f9c1a-0b52-4c44-9a1e-1f5e8c2b7a03";

const check =
  (
    steps: Parameters<typeof assertPolicyStepsCanApprove>[0]["steps"],
    { hasAutoApprovalRules = false, supportsAutoApproval = false, noStepsMeansNoApproval = false } = {}
  ) =>
  () =>
    assertPolicyStepsCanApprove({ steps, hasAutoApprovalRules, supportsAutoApproval, noStepsMeansNoApproval });

describe("assertPolicyStepsCanApprove", () => {
  it("refuses a policy with no steps", () => {
    expect(check([])).toThrow(BadRequestError);
    expect(check([])).toThrow(
      "Add at least one approval step. Without one, requests on this policy can never be approved."
    );
  });

  it("points to auto-approval rules when the policy type can use them", () => {
    expect(check([], { supportsAutoApproval: true })).toThrow(
      "Add at least one approval step or an auto-approval rule. Without either, requests on this policy can never be approved."
    );
  });

  it("allows a policy with no steps when its auto-approval rules can approve requests", () => {
    expect(check([], { hasAutoApprovalRules: true, supportsAutoApproval: true })).not.toThrow();
  });

  it("allows no steps on a policy type where that means no approval, but still refuses an empty step", () => {
    expect(check([], { noStepsMeansNoApproval: true })).not.toThrow();
    expect(check([{ requiredApprovals: 1, approvers: [] }], { noStepsMeansNoApproval: true })).toThrow(
      "Approval step 1 has no approvers."
    );
  });

  it("refuses a step with no approvers and names the step", () => {
    const steps = [
      { requiredApprovals: 1, approvers: [user(USER_A)] },
      { name: "Security review", requiredApprovals: 1, approvers: [] }
    ];

    expect(check(steps)).toThrow(
      "Approval step 2 ('Security review') has no approvers. Add at least one user or group."
    );
  });

  it("refuses an empty step even when auto-approval rules exist", () => {
    expect(check([{ requiredApprovals: 1, approvers: [] }], { hasAutoApprovalRules: true })).toThrow(
      "Approval step 1 has no approvers. Add at least one user or group."
    );
  });

  it("refuses a step needing more approvals than the users it names", () => {
    expect(check([{ requiredApprovals: 3, approvers: [user(USER_A), user(USER_B)] }])).toThrow(
      "Approval step 1 requires 3 approvals but names only 2 approvers. Lower the required approvals or add approvers."
    );
  });

  it("counts a user named twice in a step once", () => {
    expect(check([{ requiredApprovals: 2, approvers: [user(USER_A), user(USER_A)] }])).toThrow(
      "Approval step 1 requires 2 approvals but names only 1 approver. Lower the required approvals or add approvers."
    );
  });

  it("allows a step naming a group to require more approvals than it has entries", () => {
    expect(check([{ requiredApprovals: 3, approvers: [user(USER_A), group(GROUP_A)] }])).not.toThrow();
  });

  it("allows a policy whose every step can complete", () => {
    const steps = [
      { name: "Team lead", requiredApprovals: 1, approvers: [user(USER_A)] },
      { requiredApprovals: 2, approvers: [user(USER_A), user(USER_B)] }
    ];

    expect(check(steps)).not.toThrow();
  });
});
