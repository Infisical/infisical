import { describe, expect, test } from "vitest";

import { BadRequestError } from "@app/lib/errors";
import { ApprovalPolicyType, EnforcementLevel } from "@app/services/approval-policy/approval-policy-enums";

import {
  assertExternalApprovalPolicyConstraints,
  assertPolicyTypeSupportsExternalApproval
} from "./external-approval-fns";

describe("assertExternalApprovalPolicyConstraints", () => {
  const valid = { enforcementLevel: EnforcementLevel.Hard, bypassers: [], allowedSelfApprovals: false };

  test("accepts a hard policy without bypassers or self approvals", () => {
    expect(() => assertExternalApprovalPolicyConstraints(valid)).not.toThrow();
    expect(() => assertExternalApprovalPolicyConstraints({ ...valid, bypassers: undefined })).not.toThrow();
  });

  test("rejects approvers", () => {
    expect(() =>
      assertExternalApprovalPolicyConstraints({ ...valid, approvers: [{ type: "user", id: "u1" }] })
    ).toThrow(BadRequestError);
    expect(() => assertExternalApprovalPolicyConstraints({ ...valid, approvers: [] })).not.toThrow();
  });

  test("rejects soft enforcement", () => {
    expect(() =>
      assertExternalApprovalPolicyConstraints({ ...valid, enforcementLevel: EnforcementLevel.Soft })
    ).toThrow(BadRequestError);
  });

  test("rejects bypassers", () => {
    expect(() =>
      assertExternalApprovalPolicyConstraints({ ...valid, bypassers: [{ type: "user", id: "u1" }] })
    ).toThrow(BadRequestError);
  });

  test("rejects self approvals", () => {
    expect(() => assertExternalApprovalPolicyConstraints({ ...valid, allowedSelfApprovals: true })).toThrow(
      BadRequestError
    );
  });
});

describe("assertPolicyTypeSupportsExternalApproval", () => {
  test("accepts secret access policies", () => {
    expect(() => assertPolicyTypeSupportsExternalApproval(ApprovalPolicyType.SecretAccess)).not.toThrow();
  });

  test.each([
    ApprovalPolicyType.SecretChange,
    ApprovalPolicyType.PamAccess,
    ApprovalPolicyType.CertRequest,
    ApprovalPolicyType.CertCodeSigning
  ])("rejects %s policies", (policyType) => {
    expect(() => assertPolicyTypeSupportsExternalApproval(policyType)).toThrow(BadRequestError);
  });
});
