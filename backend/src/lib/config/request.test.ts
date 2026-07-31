import { AxiosError } from "axios";

import { isRetryableRequestError } from "./request";

const responseError = (status: number) => ({ code: "ERR_BAD_RESPONSE", response: { status } }) as unknown as AxiosError;

describe("isRetryableRequestError", () => {
  test("retries on 429 so a backoff can recover from throttling", () => {
    expect(isRetryableRequestError(responseError(429))).toBe(true);
  });

  test("retries on 5xx and transient network errors", () => {
    expect(isRetryableRequestError(responseError(503))).toBe(true);
    expect(isRetryableRequestError({ code: "ECONNRESET" } as AxiosError)).toBe(true);
  });

  test("does not retry on other 4xx client errors", () => {
    expect(isRetryableRequestError(responseError(400))).toBe(false);
    expect(isRetryableRequestError(responseError(404))).toBe(false);
  });
});
