import { describe, expect, test } from "vitest";

import { DELEGATED_APPROVAL_CALLBACK_PATH } from "./delegated-approval-callback-constants";
import {
  buildDelegatedApprovalCallbackUrl,
  generateDelegatedApprovalCallbackToken
} from "./delegated-approval-callback-fns";

describe("generateDelegatedApprovalCallbackToken", () => {
  test("returns a fresh base64url token of 32 random bytes", () => {
    const token = generateDelegatedApprovalCallbackToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
    expect(generateDelegatedApprovalCallbackToken()).not.toBe(token);
  });
});

describe("buildDelegatedApprovalCallbackUrl", () => {
  test("joins the site URL and the callback path", () => {
    expect(buildDelegatedApprovalCallbackUrl("https://app.infisical.com")).toBe(
      `https://app.infisical.com${DELEGATED_APPROVAL_CALLBACK_PATH}`
    );
    expect(buildDelegatedApprovalCallbackUrl("https://app.infisical.com/")).toBe(
      `https://app.infisical.com${DELEGATED_APPROVAL_CALLBACK_PATH}`
    );
  });
});
