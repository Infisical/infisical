import { AxiosError } from "axios";

import { createRequestClient, isRetryableRequestError } from "./request";

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

describe("createRequestClient", () => {
  const client = createRequestClient({}, { retries: 0 });

  test("drops the URL from axios's missing-slashes error and keeps its code", async () => {
    const err = (await client.post("http:example.com/hooks/s3cret", {}).catch((e: unknown) => e)) as AxiosError;
    expect(err).toBeInstanceOf(AxiosError);
    expect(err.code).toBe(AxiosError.ERR_INVALID_URL);
    expect(err.message).toBe('Invalid URL: missing "//" after protocol');
    expect(err.stack).not.toContain("s3cret");
  });

  test("passes other request errors through unchanged", async () => {
    const error = new AxiosError("Request failed with status code 500", AxiosError.ERR_BAD_RESPONSE);
    await expect(client.get("http://example.com/", { adapter: () => Promise.reject(error) })).rejects.toBe(error);
  });
});
