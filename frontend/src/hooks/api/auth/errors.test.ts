import { AxiosError, AxiosHeaders } from "axios";
import { describe, expect, test } from "vitest";

import { BREACHED_PASSWORD_ERROR, getBreachedPasswordMessage } from "./errors";

const MESSAGE = "This password has appeared in a known data breach. Choose a different password.";

const apiError = (status: number, data: unknown) =>
  new AxiosError("Request failed", undefined, undefined, undefined, {
    status,
    statusText: "",
    data,
    headers: {},
    config: { headers: new AxiosHeaders() }
  });

describe("getBreachedPasswordMessage", () => {
  test("returns the server message for a breached password", () => {
    const error = apiError(400, { error: BREACHED_PASSWORD_ERROR, message: MESSAGE });

    expect(getBreachedPasswordMessage(error)).toBe(MESSAGE);
  });

  test("ignores any other 400", () => {
    const error = apiError(400, { error: "BadRequest", message: "Incorrect current password." });

    expect(getBreachedPasswordMessage(error)).toBeUndefined();
  });

  test("ignores an error that is not from the API", () => {
    expect(getBreachedPasswordMessage(new Error(MESSAGE))).toBeUndefined();
  });
});
