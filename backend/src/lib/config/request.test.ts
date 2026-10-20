import http from "node:http";
import { AddressInfo } from "node:net";

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
    const server = http.createServer((_req, res) => {
      res.statusCode = 500;
      res.end();
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    try {
      const { port } = server.address() as AddressInfo;
      const err = (await client
        .get(`http://127.0.0.1:${port}/`, { timeout: 5000 })
        .catch((e: unknown) => e)) as AxiosError;
      expect(err.message).toBe("Request failed with status code 500");
      expect(err.response?.status).toBe(500);
    } finally {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
  });
});
