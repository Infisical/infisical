import { AxiosError, AxiosHeaders } from "axios";
import { describe, expect, test } from "vitest";

import { getAccessErrorMessage } from "./access-error";

const FALLBACK = "Failed to access account";

const apiError = (status: number, data: unknown) =>
  new AxiosError("Request failed", undefined, undefined, undefined, {
    status,
    statusText: "",
    data,
    headers: {},
    config: { headers: new AxiosHeaders() }
  });

describe("getAccessErrorMessage", () => {
  test("joins the issues of a validation failure into text", () => {
    const error = apiError(422, {
      error: "ValidationFailure",
      message: [
        {
          code: "custom",
          message: "Reason cannot contain zero-width characters",
          path: ["reason"]
        },
        { code: "too_big", message: "Reason is too long", path: ["reason"] }
      ]
    });

    expect(getAccessErrorMessage(error, FALLBACK)).toBe(
      "Reason cannot contain zero-width characters. Reason is too long"
    );
  });

  test("returns a string message as is", () => {
    const error = apiError(400, { error: "BadRequest", message: "Account requires approval" });

    expect(getAccessErrorMessage(error, FALLBACK)).toBe("Account requires approval");
  });

  test("returns the string message of a validation failure for an overlong value", () => {
    const message = "One or more field values exceed the maximum length allowed for this resource";
    const error = apiError(422, { error: "ValidationFailure", message });

    expect(getAccessErrorMessage(error, FALLBACK)).toBe(message);
  });

  test.each([
    [
      "a validation failure without issues",
      apiError(422, { error: "ValidationFailure", message: [] })
    ],
    ["a non-string message", apiError(500, { error: "Internal", message: { detail: "x" } })],
    ["a response without a body", apiError(502, undefined)],
    ["an error that is not from axios", new Error("network down")]
  ])("falls back on %s", (_, error) => {
    expect(getAccessErrorMessage(error, FALLBACK)).toBe(FALLBACK);
  });
});
