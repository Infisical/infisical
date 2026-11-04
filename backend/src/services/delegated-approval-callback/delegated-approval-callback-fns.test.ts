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
import { generateCallbackToken, isTokenMatch, rejectApprovalCallback } from "./delegated-approval-callback-fns";

describe("generateCallbackToken", () => {
  test("returns a prefixed base64url token of 32 random bytes", () => {
    const token = generateCallbackToken();

    expect(token.startsWith(DELEGATED_APPROVAL_CALLBACK_TOKEN_PREFIX)).toBe(true);
    const random = token.slice(DELEGATED_APPROVAL_CALLBACK_TOKEN_PREFIX.length);
    expect(random).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Buffer.from(random, "base64url")).toHaveLength(32);
    expect(generateCallbackToken()).not.toBe(token);
  });
});

describe("isTokenMatch", () => {
  test("matches only the exact stored token", () => {
    const token = generateCallbackToken();

    expect(isTokenMatch(token, token)).toBe(true);
    expect(isTokenMatch(`${token}x`, token)).toBe(false);
    expect(isTokenMatch(token.slice(0, -1), token)).toBe(false);
    expect(isTokenMatch(generateCallbackToken(), token)).toBe(false);
  });
});

describe("rejectApprovalCallback", () => {
  test("returns a 403 whose message never carries the reason", () => {
    const error = rejectApprovalCallback("token mismatch", { delegatedRequestId: "delegated-1" });

    expect(error).toBeInstanceOf(ForbiddenRequestError);
    expect(error.message).toBe(DELEGATED_APPROVAL_CALLBACK_REJECTED_MESSAGE);
    expect(error.message).not.toContain("token mismatch");
    expect(error.message).not.toContain("delegated-1");
  });
});
