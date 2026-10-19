import { describe, expect, test, vi } from "vitest";

vi.mock("@app/lib/logger", () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
  initLogger: () => {}
}));

// eslint-disable-next-line import/first
import { ForbiddenRequestError } from "@app/lib/errors";

// eslint-disable-next-line import/first
import {
  DELEGATED_APPROVAL_CALLBACK_REJECTED_MESSAGE,
  DELEGATED_APPROVAL_CALLBACK_TOKEN_PREFIX
} from "./delegated-approval-callback-constants";
// eslint-disable-next-line import/first
import {
  generateDelegatedApprovalCallbackToken,
  isDelegatedApprovalCallbackTokenMatch,
  rejectDelegatedApprovalCallback
} from "./delegated-approval-callback-fns";

describe("generateDelegatedApprovalCallbackToken", () => {
  test("returns a prefixed base64url token of 32 random bytes", () => {
    const token = generateDelegatedApprovalCallbackToken();

    expect(token.startsWith(DELEGATED_APPROVAL_CALLBACK_TOKEN_PREFIX)).toBe(true);
    const random = token.slice(DELEGATED_APPROVAL_CALLBACK_TOKEN_PREFIX.length);
    expect(random).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Buffer.from(random, "base64url")).toHaveLength(32);
    expect(generateDelegatedApprovalCallbackToken()).not.toBe(token);
  });
});

describe("isDelegatedApprovalCallbackTokenMatch", () => {
  test("matches only the exact stored token", () => {
    const token = generateDelegatedApprovalCallbackToken();

    expect(isDelegatedApprovalCallbackTokenMatch(token, token)).toBe(true);
    expect(isDelegatedApprovalCallbackTokenMatch(`${token}x`, token)).toBe(false);
    expect(isDelegatedApprovalCallbackTokenMatch(token.slice(0, -1), token)).toBe(false);
    expect(isDelegatedApprovalCallbackTokenMatch(generateDelegatedApprovalCallbackToken(), token)).toBe(false);
  });
});

describe("rejectDelegatedApprovalCallback", () => {
  test("returns a 403 whose message never carries the reason", () => {
    const error = rejectDelegatedApprovalCallback("token mismatch", { delegatedRequestId: "delegated-1" });

    expect(error).toBeInstanceOf(ForbiddenRequestError);
    expect(error.message).toBe(DELEGATED_APPROVAL_CALLBACK_REJECTED_MESSAGE);
    expect(error.message).not.toContain("token mismatch");
    expect(error.message).not.toContain("delegated-1");
  });
});
