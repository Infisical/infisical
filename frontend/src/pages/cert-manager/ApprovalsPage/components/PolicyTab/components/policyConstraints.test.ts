import { describe, expect, it } from "vitest";

import {
  ApprovalPolicyType,
  CertRequestRenewalApproval
} from "@app/hooks/api/approvalPolicies/types";

import { getPolicyConstraints, getPolicyRenewalApproval } from "./policyConstraints";

describe("getPolicyRenewalApproval", () => {
  it("reads the stored setting", () => {
    expect(
      getPolicyRenewalApproval({
        constraints: {
          version: 1,
          constraints: { renewalApproval: CertRequestRenewalApproval.Always }
        }
      })
    ).toBe(CertRequestRenewalApproval.Always);
  });

  it("falls back to on-change for a policy stored before the setting existed", () => {
    expect(getPolicyRenewalApproval({ constraints: { version: 1, constraints: {} } })).toBe(
      CertRequestRenewalApproval.OnChange
    );
  });
});

describe("getPolicyConstraints", () => {
  it("sends the renewal setting for an issuance policy", () => {
    expect(
      getPolicyConstraints(ApprovalPolicyType.CertRequest, CertRequestRenewalApproval.Always)
    ).toEqual({ renewalApproval: CertRequestRenewalApproval.Always });
  });

  it("sends no constraints for a revocation policy", () => {
    expect(
      getPolicyConstraints(ApprovalPolicyType.CertRevocation, CertRequestRenewalApproval.Always)
    ).toEqual({});
  });
});
