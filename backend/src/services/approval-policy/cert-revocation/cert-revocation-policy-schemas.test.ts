import { describe, expect, it } from "vitest";

import { ApprovalPolicyScope, ApproverType } from "../approval-policy-enums";
import { CreateCertRevocationPolicySchema, UpdateCertRevocationPolicySchema } from "./cert-revocation-policy-schemas";

const createInput = {
  scope: ApprovalPolicyScope.PkiApplication,
  scopeId: "6f1c1f1e-3a51-4b7e-9d7e-6c6d7f0b1a01",
  name: "prod-revocations",
  steps: [
    { requiredApprovals: 1, approvers: [{ type: ApproverType.User, id: "6f1c1f1e-3a51-4b7e-9d7e-6c6d7f0b1a09" }] }
  ],
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

describe("revocation policy steps", () => {
  const noStepMessage = "A revocation approval policy needs at least one approval step";
  const noApproverMessage = "Each approval step needs at least one approver";

  it.each([
    ["create", (steps: unknown) => CreateCertRevocationPolicySchema.safeParse({ ...createInput, steps })],
    ["update", (steps: unknown) => UpdateCertRevocationPolicySchema.safeParse({ steps })]
  ])("refuses a policy nobody could approve on %s", (_label, parse) => {
    expect(parse([]).error?.issues).toEqual([expect.objectContaining({ path: ["steps"], message: noStepMessage })]);
    expect(parse([{ requiredApprovals: 1, approvers: [] }]).error?.issues).toEqual([
      expect.objectContaining({ path: ["steps", 0, "approvers"], message: noApproverMessage })
    ]);
  });
});

describe("revocation policy step approver count", () => {
  const userId = "6f1c1f1e-3a51-4b7e-9d7e-6c6d7f0b1a09";
  const groupId = "6f1c1f1e-3a51-4b7e-9d7e-6c6d7f0b1a0a";

  it.each([
    ["create", (steps: unknown) => CreateCertRevocationPolicySchema.safeParse({ ...createInput, steps })],
    ["update", (steps: unknown) => UpdateCertRevocationPolicySchema.safeParse({ steps })]
  ])("refuses a step that needs more approvals than it has user approvers on %s", (_label, parse) => {
    const result = parse([
      { requiredApprovals: 1, approvers: [{ type: ApproverType.User, id: userId }] },
      { requiredApprovals: 2, approvers: [{ type: ApproverType.User, id: userId }] }
    ]);

    expect(result.error?.issues).toEqual([
      expect.objectContaining({
        path: ["steps", 1, "requiredApprovals"],
        message:
          "Step 2 requires 2 approvals but only has 1 approver. Add approvers to the step or lower its required approvals."
      })
    ]);
  });

  it("accepts a step whose required approvals could come from a group", () => {
    const result = CreateCertRevocationPolicySchema.safeParse({
      ...createInput,
      steps: [
        {
          requiredApprovals: 3,
          approvers: [
            { type: ApproverType.User, id: userId },
            { type: ApproverType.Group, id: groupId }
          ]
        }
      ]
    });

    expect(result.success).toBe(true);
  });
});
