import { describe, expect, test } from "vitest";

import { generateDelegatedApprovalCallbackToken } from "./delegated-approval-callback-fns";

describe("generateDelegatedApprovalCallbackToken", () => {
  test("returns a fresh base64url token of 32 random bytes", () => {
    const token = generateDelegatedApprovalCallbackToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
    expect(generateDelegatedApprovalCallbackToken()).not.toBe(token);
  });
});
