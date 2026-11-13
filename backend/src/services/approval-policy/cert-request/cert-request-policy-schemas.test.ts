import { describe, expect, it } from "vitest";

import { ApprovalPolicyScope, CertRequestRenewalApproval } from "../approval-policy-enums";
import {
  CertRequestPolicySchema,
  CreateCertRequestPolicySchema,
  parseCertRequestRenewalApproval,
  UpdateCertRequestPolicySchema
} from "./cert-request-policy-schemas";

describe("cert-request policy renewal approval setting", () => {
  it("stores a policy created without constraints as holding renewals on change", () => {
    const body = CreateCertRequestPolicySchema.parse({
      scope: ApprovalPolicyScope.Project,
      scopeId: "00000000-0000-4000-8000-000000000000",
      name: "Web servers",
      conditions: [{ profileNames: ["web-servers"] }],
      steps: [{ requiredApprovals: 1, approvers: [{ type: "user", id: "00000000-0000-4000-8000-000000000001" }] }]
    });

    expect(body.constraints).toEqual({ renewalApproval: CertRequestRenewalApproval.OnChange });
  });

  it.each([
    [{ version: 1, constraints: {} }, CertRequestRenewalApproval.OnChange],
    [{ version: 1, constraints: { renewalApproval: "always" } }, CertRequestRenewalApproval.Always],
    [null, CertRequestRenewalApproval.OnChange]
  ])("reads the setting of a stored policy %j", (constraints, expected) => {
    expect(parseCertRequestRenewalApproval({ constraints })).toBe(expected);
  });

  it("returns a policy stored before the setting existed as holding renewals on change", () => {
    const { shape } = CertRequestPolicySchema;
    expect(shape.constraints.parse({ version: 1, constraints: {} })).toEqual({
      version: 1,
      constraints: { renewalApproval: CertRequestRenewalApproval.OnChange }
    });
  });

  it.each([{}, undefined])("keeps the stored setting when an update sends constraints %j", (constraints) => {
    expect(UpdateCertRequestPolicySchema.parse({ constraints }).constraints).toBeUndefined();
  });

  it("changes the setting when an update names it", () => {
    expect(
      UpdateCertRequestPolicySchema.parse({ constraints: { renewalApproval: CertRequestRenewalApproval.Always } })
        .constraints
    ).toEqual({ renewalApproval: CertRequestRenewalApproval.Always });
  });
});
