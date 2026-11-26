import { describe, expect, test } from "vitest";

import { ApprovalPolicyScope } from "../approval-policy-enums";
import {
  CodeSigningRequestSchema,
  CreateCodeSigningRequestSchema,
  signingJustificationSchema
} from "./code-signing-policy-schemas";

const STORED_REASON_LENGTH = 2048;

const signerRequestData = {
  signerId: "9ba910e9-9a71-4da5-8319-cf2333bbb10c",
  approvalPolicyId: "6200dbf9-d8b1-4a03-920c-b219abba2cfb",
  signerName: "release-signer",
  requestedWindowDuration: "8h"
};

const createBody = (body: Record<string, unknown>) => ({
  scope: ApprovalPolicyScope.Project,
  scopeId: "27d0e87e-9a8a-4ff8-8ebb-40c8bc03429b",
  ...body
});

describe("CodeSigningRequestSchema", () => {
  test("returns stored requests whose reason is 2048 characters", () => {
    const parsed = CodeSigningRequestSchema.shape.requestData.safeParse({
      version: 1,
      requestData: { ...signerRequestData, justification: "a".repeat(STORED_REASON_LENGTH) }
    });

    expect(parsed.success).toBe(true);
  });
});

describe("signingJustificationSchema", () => {
  test("accepts 2048 characters and refuses 2049", () => {
    expect(signingJustificationSchema().safeParse("a".repeat(STORED_REASON_LENGTH)).success).toBe(true);
    expect(signingJustificationSchema().safeParse("a".repeat(STORED_REASON_LENGTH + 1)).success).toBe(false);
  });

  test("refuses a blank reason only where one is required", () => {
    expect(signingJustificationSchema({ required: true }).safeParse("   ").success).toBe(false);
    expect(signingJustificationSchema().safeParse("   ").success).toBe(true);
  });
});

describe("CreateCodeSigningRequestSchema", () => {
  test("stores the top-level reason in both places when the request data carries a different one", () => {
    const justification = "a".repeat(STORED_REASON_LENGTH);

    const parsed = CreateCodeSigningRequestSchema.parse(
      createBody({
        justification,
        requestData: { ...signerRequestData, justification: "a different reason approvers would never see" }
      })
    );

    expect(parsed.justification).toBe(justification);
    expect(parsed.requestData.justification).toBe(justification);
  });

  test.each([undefined, null, "", "   "])(
    "keeps a reason sent only in the request data when the top-level reason is %j",
    (topLevel) => {
      const parsed = CreateCodeSigningRequestSchema.parse(
        createBody({
          justification: topLevel,
          requestData: { ...signerRequestData, justification: "nightly build signing" }
        })
      );

      expect(parsed.justification).toBe("nightly build signing");
      expect(parsed.requestData.justification).toBe("nightly build signing");
    }
  );
});
