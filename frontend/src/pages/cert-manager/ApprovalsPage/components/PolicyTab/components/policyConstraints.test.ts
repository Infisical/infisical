import { describe, expect, it } from "vitest";

import { ApprovalPolicyType } from "@app/hooks/api/approvalPolicies";
import { CertRequestPolicyOperation } from "@app/hooks/api/approvalPolicies/types";

import { getCertPolicyTypeLabel, getPolicyOperation } from "./policyConstraints";

describe("getPolicyOperation", () => {
  it("reads the stored type", () => {
    expect(
      getPolicyOperation({
        constraints: { version: 1, constraints: { operation: CertRequestPolicyOperation.Renewal } }
      })
    ).toBe(CertRequestPolicyOperation.Renewal);
  });

  it("reads a policy stored before Renewal policies existed as an Issuance policy", () => {
    expect(getPolicyOperation({ constraints: { version: 1, constraints: {} } })).toBe(
      CertRequestPolicyOperation.Issuance
    );
  });
});

describe("getCertPolicyTypeLabel", () => {
  it.each([
    [ApprovalPolicyType.CertRequest, CertRequestPolicyOperation.Issuance, "Issuance"],
    [ApprovalPolicyType.CertRequest, CertRequestPolicyOperation.Renewal, "Renewal"],
    [ApprovalPolicyType.CertRequest, undefined, "Issuance"],
    [ApprovalPolicyType.CertRevocation, undefined, "Revocation"]
  ])("labels a %s policy with operation %s as %s", (type, operation, label) => {
    expect(getCertPolicyTypeLabel(type, operation)).toBe(label);
  });
});
