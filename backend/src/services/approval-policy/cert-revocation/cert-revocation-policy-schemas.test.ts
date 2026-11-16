import { describe, expect, it } from "vitest";

import { ApprovalPolicyScope } from "../approval-policy-enums";
import { CreateCertRevocationPolicySchema, UpdateCertRevocationPolicySchema } from "./cert-revocation-policy-schemas";

const createInput = {
  scope: ApprovalPolicyScope.PkiApplication,
  scopeId: "6f1c1f1e-3a51-4b7e-9d7e-6c6d7f0b1a01",
  name: "prod-revocations",
  steps: [],
  conditions: [{ profileNames: ["prod-tls"] }]
};

const bypassMessage = "Revocation approval policies can't be bypassed by machine identities";

describe("CreateCertRevocationPolicySchema.bypassForMachineIdentities", () => {
  it("refuses a policy that machine identities could bypass", () => {
    const result = CreateCertRevocationPolicySchema.safeParse({ ...createInput, bypassForMachineIdentities: true });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual([
      expect.objectContaining({ path: ["bypassForMachineIdentities"], message: bypassMessage })
    ]);
  });

  it("accepts false", () => {
    const result = CreateCertRevocationPolicySchema.safeParse({ ...createInput, bypassForMachineIdentities: false });

    expect(result.success && result.data.bypassForMachineIdentities).toBe(false);
  });

  it("defaults to false when omitted", () => {
    const result = CreateCertRevocationPolicySchema.safeParse(createInput);

    expect(result.success && result.data.bypassForMachineIdentities).toBe(false);
  });
});

describe("UpdateCertRevocationPolicySchema.bypassForMachineIdentities", () => {
  it("refuses turning on the machine identity bypass", () => {
    const result = UpdateCertRevocationPolicySchema.safeParse({ bypassForMachineIdentities: true });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual([
      expect.objectContaining({ path: ["bypassForMachineIdentities"], message: bypassMessage })
    ]);
  });

  it("leaves the bypass unset when omitted", () => {
    const result = UpdateCertRevocationPolicySchema.safeParse({});

    expect(result.success && result.data.bypassForMachineIdentities).toBeUndefined();
  });
});
