import { describe, expect, test } from "vitest";

import { CodeSigningRequestSchema, MAX_SIGNING_JUSTIFICATION_LENGTH } from "./code-signing-policy-schemas";

const storedRequestData = (justification: string) => ({
  version: 1 as const,
  requestData: {
    signerId: "9ba910e9-9a71-4da5-8319-cf2333bbb10c",
    approvalPolicyId: "6200dbf9-d8b1-4a03-920c-b219abba2cfb",
    signerName: "release-signer",
    justification,
    requestedWindowDuration: "8h"
  }
});

describe("CodeSigningRequestSchema", () => {
  const requestDataSchema = CodeSigningRequestSchema.shape.requestData;

  test("returns a request whose justification is as long as the signer endpoints accept", () => {
    const justification = "a".repeat(MAX_SIGNING_JUSTIFICATION_LENGTH);

    expect(requestDataSchema.safeParse(storedRequestData(justification)).success).toBe(true);
  });
});
