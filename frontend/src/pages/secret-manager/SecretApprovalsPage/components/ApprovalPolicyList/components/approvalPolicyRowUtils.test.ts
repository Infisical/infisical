import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Approver, ApproverType } from "@app/hooks/api/accessApproval/types";

import { groupApproversBySequence } from "./approvalPolicyRowUtils";

const approver = (overrides: Partial<Approver>): Approver => ({
  id: "approver-id",
  type: ApproverType.User,
  isOrgMembershipActive: true,
  ...overrides
});

describe("approval policy sequence details", () => {
  it("sorts and groups approvers by their actual sequence without mutating query data", () => {
    const approvers = [
      approver({ id: "step-2-user", sequence: 2, approvalsRequired: 2 }),
      approver({
        id: "step-1-group",
        type: ApproverType.Group,
        sequence: 1,
        approvalsRequired: 1
      }),
      approver({ id: "step-1-user", sequence: 1, approvalsRequired: 1 })
    ];
    const originalOrder = approvers.map(({ id }) => id);

    const steps = groupApproversBySequence(approvers, 3);

    assert.deepEqual(
      steps.map(({ sequence, approvals, user, group }) => ({
        sequence,
        approvals,
        users: user.map(({ id }) => id),
        groups: group.map(({ id }) => id)
      })),
      [
        {
          sequence: 1,
          approvals: 1,
          users: ["step-1-user"],
          groups: ["step-1-group"]
        },
        { sequence: 2, approvals: 2, users: ["step-2-user"], groups: [] }
      ]
    );
    assert.deepEqual(
      approvers.map(({ id }) => id),
      originalOrder
    );
  });

  it("uses sequence one and the policy approval count for legacy approvers", () => {
    const steps = groupApproversBySequence([approver({})], 4);

    assert.equal(steps[0].sequence, 1);
    assert.equal(steps[0].approvals, 4);
  });
});
