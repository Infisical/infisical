import { describe, expect, test } from "vitest";

import { BadRequestError } from "@app/lib/errors";
import { ApprovalPolicyType, EnforcementLevel } from "@app/services/approval-policy/approval-policy-enums";

import {
  assertDelegatedApprovalPolicyConstraints,
  assertPolicyTypeSupportsDelegatedApproval
} from "./delegated-approval-fns";

describe("assertDelegatedApprovalPolicyConstraints", () => {
  const valid = { enforcementLevel: EnforcementLevel.Hard, bypassers: [], allowedSelfApprovals: false };

  test("accepts a hard policy without bypassers or self approvals", () => {
    expect(() => assertDelegatedApprovalPolicyConstraints(valid)).not.toThrow();
    expect(() => assertDelegatedApprovalPolicyConstraints({ ...valid, bypassers: undefined })).not.toThrow();
  });

  test("rejects approvers", () => {
    expect(() =>
      assertDelegatedApprovalPolicyConstraints({ ...valid, approvers: [{ type: "user", id: "u1" }] })
    ).toThrow(BadRequestError);
    expect(() => assertDelegatedApprovalPolicyConstraints({ ...valid, approvers: [] })).not.toThrow();
  });

  test("rejects soft enforcement", () => {
    expect(() =>
      assertDelegatedApprovalPolicyConstraints({ ...valid, enforcementLevel: EnforcementLevel.Soft })
    ).toThrow(BadRequestError);
  });

  test("rejects bypassers", () => {
    expect(() =>
      assertDelegatedApprovalPolicyConstraints({ ...valid, bypassers: [{ type: "user", id: "u1" }] })
    ).toThrow(BadRequestError);
  });

  test("rejects self approvals", () => {
    expect(() => assertDelegatedApprovalPolicyConstraints({ ...valid, allowedSelfApprovals: true })).toThrow(
      BadRequestError
    );
  });
});

describe("assertPolicyTypeSupportsDelegatedApproval", () => {
  test("accepts secret access policies", () => {
    expect(() => assertPolicyTypeSupportsDelegatedApproval(ApprovalPolicyType.SecretAccess)).not.toThrow();
  });

  test.each([
    ApprovalPolicyType.SecretChange,
    ApprovalPolicyType.PamAccess,
    ApprovalPolicyType.CertRequest,
    ApprovalPolicyType.CertCodeSigning
  ])("rejects %s policies", (policyType) => {
    expect(() => assertPolicyTypeSupportsDelegatedApproval(policyType)).toThrow(BadRequestError);
  });
});
