import { describe, expect, it } from "vitest";

import { ApprovalPolicyScope, CertRequestPolicyOperation } from "../approval-policy-enums";
import {
  CreateCertRequestPolicySchema,
  parseCertRequestPolicyOperation,
  UpdateCertRequestPolicySchema
} from "./cert-request-policy-schemas";

describe("cert-request policy type", () => {
  it("stores a policy created without a type with no type", () => {
    const body = CreateCertRequestPolicySchema.parse({
      scope: ApprovalPolicyScope.Project,
      scopeId: "00000000-0000-4000-8000-000000000000",
      name: "Web servers",
      conditions: [{ profileNames: ["web-servers"] }],
      steps: [{ requiredApprovals: 1, approvers: [{ type: "user", id: "00000000-0000-4000-8000-000000000001" }] }]
    });

    expect(body.constraints).toEqual({});
  });

  it.each([
    [{ version: 1, constraints: { operation: "renewal" } }, CertRequestPolicyOperation.Renewal],
    [{ version: 1, constraints: { operation: "issuance" } }, CertRequestPolicyOperation.Issuance],
    [{ version: 1, constraints: {} }, CertRequestPolicyOperation.Issuance],
    [null, CertRequestPolicyOperation.Issuance]
  ])("reads the type of a stored policy %j", (constraints, expected) => {
    expect(parseCertRequestPolicyOperation({ constraints })).toBe(expected);
  });

  it.each([{}, undefined])("keeps the stored type when an update sends constraints %j", (constraints) => {
    expect(UpdateCertRequestPolicySchema.parse({ constraints }).constraints).toBeUndefined();
  });

  it("passes a type an update names on for the policy type to check", () => {
    expect(
      UpdateCertRequestPolicySchema.parse({ constraints: { operation: CertRequestPolicyOperation.Renewal } })
        .constraints
    ).toEqual({ operation: CertRequestPolicyOperation.Renewal });
  });
});
