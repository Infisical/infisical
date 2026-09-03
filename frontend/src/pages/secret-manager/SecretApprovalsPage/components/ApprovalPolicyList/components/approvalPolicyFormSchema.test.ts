import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApproverType, BypasserType } from "@app/hooks/api/accessApproval/types";
import { EnforcementLevel, PolicyType } from "@app/hooks/api/policies/enums";

import { approvalPolicyFormSchema } from "./approvalPolicyFormSchema";

const userApprover = (id: string, isOrgMembershipActive = true) => ({
  type: ApproverType.User as const,
  id,
  isOrgMembershipActive
});

const basePolicy = {
  environments: [{ slug: "dev", name: "Development" }],
  secretPath: "/",
  approvals: 1,
  userApprovers: [userApprover("user-1")],
  groupApprovers: [],
  userBypassers: [],
  groupBypassers: [],
  policyType: PolicyType.ChangePolicy,
  enforcementLevel: EnforcementLevel.Hard,
  allowedSelfApprovals: true,
  bypassForMachineIdentities: false,
  sequenceApprovers: []
};

const getIssuePaths = (input: unknown) => {
  const result = approvalPolicyFormSchema.safeParse(input);
  assert.equal(result.success, false);
  return result.error.issues.map(({ path }) => path.join("."));
};

describe("approval policy form schema", () => {
  it("rejects a change-policy threshold above its individual approver count", () => {
    assert.ok(getIssuePaths({ ...basePolicy, approvals: 2 }).includes("approvals"));
  });

  it("allows a change-policy threshold above the selected subject count when a group is present", () => {
    const result = approvalPolicyFormSchema.safeParse({
      ...basePolicy,
      approvals: 2,
      groupApprovers: [{ type: ApproverType.Group, id: "group-1" }]
    });

    assert.equal(result.success, true);
  });

  it("rejects an impossible access-policy step threshold", () => {
    const issuePaths = getIssuePaths({
      ...basePolicy,
      policyType: PolicyType.AccessPolicy,
      userApprovers: [],
      sequenceApprovers: [{ user: [userApprover("user-1")], group: [], approvals: 2 }]
    });

    assert.ok(issuePaths.includes("sequenceApprovers.0.approvals"));
  });

  it("rejects more than 100 approvers across access-policy steps", () => {
    const issuePaths = getIssuePaths({
      ...basePolicy,
      policyType: PolicyType.AccessPolicy,
      userApprovers: [],
      sequenceApprovers: [
        {
          user: Array.from({ length: 101 }, (_, index) => userApprover(`user-${index}`)),
          group: [],
          approvals: 1
        }
      ]
    });

    assert.ok(issuePaths.includes("sequenceApprovers"));
  });

  it("rejects more than 100 bypassers across subject types", () => {
    const issuePaths = getIssuePaths({
      ...basePolicy,
      userBypassers: Array.from({ length: 100 }, (_, index) => ({
        type: BypasserType.User as const,
        id: `user-${index}`,
        isOrgMembershipActive: true
      })),
      groupBypassers: [{ type: BypasserType.Group, id: "group-1" }]
    });

    assert.ok(issuePaths.includes("userBypassers"));
  });

  it("rejects inactive approvers and bypassers", () => {
    const issuePaths = getIssuePaths({
      ...basePolicy,
      userApprovers: [userApprover("inactive-approver", false)],
      userBypassers: [
        {
          type: BypasserType.User,
          id: "inactive-bypasser",
          isOrgMembershipActive: false
        }
      ]
    });

    assert.ok(issuePaths.includes("userApprovers.0"));
    assert.ok(issuePaths.includes("userBypassers.0"));
  });

  it("accepts an exact member email when directory options are unavailable", () => {
    const result = approvalPolicyFormSchema.safeParse({
      ...basePolicy,
      userApprovers: [
        {
          type: ApproverType.User,
          username: "approver@example.com"
        }
      ]
    });

    assert.equal(result.success, true);
  });

  it("rejects a malformed manually entered member email", () => {
    const issuePaths = getIssuePaths({
      ...basePolicy,
      userApprovers: [
        {
          type: ApproverType.User,
          username: "not-an-email"
        }
      ]
    });

    assert.ok(issuePaths.includes("userApprovers.0.username"));
  });
});
