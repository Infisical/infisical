import { describe, expect, it } from "vitest";

import { CertRequestRenewalApproval } from "@app/hooks/api/approvalPolicies/types";

import { getPolicyRenewalApproval } from "./policyConstraints";

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
