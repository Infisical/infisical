import { describe, expect, it } from "vitest";

import { ApprovalPolicyScope, ApproverType } from "../approval-policy-enums";
import {
  CertDeletionPolicyRequestDataSchema,
  CreateCertDeletionPolicySchema,
  UpdateCertDeletionPolicySchema
} from "./cert-deletion-policy-schemas";

const userId = "6f1c1f1e-3a51-4b7e-9d7e-6c6d7f0b1a09";

const createInput = {
  scope: ApprovalPolicyScope.PkiApplication,
  scopeId: "6f1c1f1e-3a51-4b7e-9d7e-6c6d7f0b1a01",
  name: "prod-deletions",
  steps: [{ requiredApprovals: 1, approvers: [{ type: ApproverType.User, id: userId }] }],
  conditions: [{ profileNames: ["prod-tls"] }]
};

const bypassMessage = "Deletion approval policies can't be bypassed by machine identities";

describe("deletion policy machine identity bypass", () => {
  it.each([
    ["create", () => CreateCertDeletionPolicySchema.safeParse({ ...createInput, bypassForMachineIdentities: true })],
    ["update", () => UpdateCertDeletionPolicySchema.safeParse({ bypassForMachineIdentities: true })]
  ])("refuses turning it on at %s", (_label, parse) => {
    expect(parse().error?.issues).toEqual([
      expect.objectContaining({ path: ["bypassForMachineIdentities"], message: bypassMessage })
    ]);
  });

  it("defaults to off when a policy is created without it", () => {
    const result = CreateCertDeletionPolicySchema.safeParse(createInput);

    expect(result.success && result.data.bypassForMachineIdentities).toBe(false);
    expect(result.success && result.data.constraints).toEqual({});
  });
});

describe("deletion policy steps", () => {
  it.each([
    ["create", (steps: unknown) => CreateCertDeletionPolicySchema.safeParse({ ...createInput, steps })],
    ["update", (steps: unknown) => UpdateCertDeletionPolicySchema.safeParse({ steps })]
  ])("refuses a policy nobody could approve on %s", (_label, parse) => {
    expect(parse([]).error?.issues).toEqual([
      expect.objectContaining({
        path: ["steps"],
        message: "A deletion approval policy needs at least one approval step"
      })
    ]);
    expect(
      parse([{ requiredApprovals: 2, approvers: [{ type: ApproverType.User, id: userId }] }]).error?.issues
    ).toEqual([
      expect.objectContaining({
        path: ["steps", 0, "requiredApprovals"],
        message:
          "Step 1 requires 2 approvals but only has 1 approver. Add approvers to the step or lower its required approvals."
      })
    ]);
  });

  it("refuses a policy that lists no profile", () => {
    expect(
      CreateCertDeletionPolicySchema.safeParse({ ...createInput, conditions: [{ profileNames: [] }] }).success
    ).toBe(false);
  });
});

describe("deletion request data", () => {
  it("keeps a certificate without a friendly name or alternative names", () => {
    const result = CertDeletionPolicyRequestDataSchema.safeParse({
      certificateId: "6f1c1f1e-3a51-4b7e-9d7e-6c6d7f0b1a02",
      serialNumber: "0a1b",
      commonName: "",
      friendlyName: null,
      altNames: null,
      profileId: "6f1c1f1e-3a51-4b7e-9d7e-6c6d7f0b1a03",
      profileName: "prod-tls",
      applicationId: "6f1c1f1e-3a51-4b7e-9d7e-6c6d7f0b1a01"
    });

    expect(result.success).toBe(true);
  });
});
