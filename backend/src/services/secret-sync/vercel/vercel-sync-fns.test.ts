import { AxiosError, AxiosHeaders } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import { TSecretSyncPayload } from "@app/services/secret-sync/secret-sync-payload";

import { VercelEnvironmentType, VercelSyncScope } from "./vercel-sync-enums";
import { VercelSyncFns } from "./vercel-sync-fns";
import { TVercelSyncWithCredentials } from "./vercel-sync-types";

vi.mock("@app/lib/config/env", () => ({ getConfig: () => ({}) }));

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@app/lib/config/request", () => ({ request: { get, post } }));
vi.mock("@app/services/secret-sync/secret-sync-fns", () => ({ matchesSchema: vi.fn() }));

const sync = {
  destinationConfig: { scope: VercelSyncScope.Project, app: "project", env: VercelEnvironmentType.Production },
  connection: { credentials: { apiToken: "test-token" } }
} as TVercelSyncWithCredentials;

describe("Vercel retry error handling", () => {
  beforeEach(() => {
    get.mockReset();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());
  it.each([new AxiosError("connection reset", "ECONNRESET"), new Error("unexpected failure")])(
    "preserves errors without an HTTP response: %s",
    async (error) => {
      get.mockRejectedValue(error);
      await expect(VercelSyncFns.getSecrets(sync)).rejects.toBe(error);
      expect(get).toHaveBeenCalledTimes(1);
    }
  );
  const rateLimitError = (headers: Record<string, string> = {}) =>
    new AxiosError("rate limited", "ERR_BAD_REQUEST", undefined, undefined, {
      status: 429,
      statusText: "Too Many Requests",
      headers,
      config: { headers: new AxiosHeaders() },
      data: {}
    });
  it("still retries HTTP 429s and returns recovered results", async () => {
    get.mockRejectedValueOnce(rateLimitError()).mockResolvedValue({ data: { envs: [] } });
    const result = VercelSyncFns.getSecrets(sync);
    await vi.runAllTimersAsync();
    await expect(result).resolves.toEqual({});
    expect(get).toHaveBeenCalledTimes(2);
  });
  it("preserves the HTTP error when retries are exhausted", async () => {
    const error = rateLimitError();
    get.mockRejectedValue(error);
    const assertion = expect(VercelSyncFns.getSecrets(sync)).rejects.toBe(error);
    await vi.runAllTimersAsync();
    await assertion;
    expect(get).toHaveBeenCalledTimes(6);
  });
  it.each([
    ["seconds", () => "5", 5000],
    ["an HTTP date", () => new Date(Date.now() + 5000).toUTCString(), 5000],
    ["more than the cap", () => "3600", 60000],
    ["unparseable", () => "soon", 60000],
    ["zero", () => "0", 3000],
    ["an already elapsed HTTP date", () => new Date(Date.now() - 5000).toUTCString(), 3000]
  ])("waits for Retry-After given as %s", async (_, retryAfter, expectedDelayMs) => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    get
      .mockRejectedValueOnce(rateLimitError({ "retry-after": retryAfter() }))
      .mockResolvedValue({ data: { envs: [] } });
    const result = VercelSyncFns.getSecrets(sync);
    await vi.advanceTimersByTimeAsync(expectedDelayMs - 1);
    expect(get).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toEqual({});
    expect(get).toHaveBeenCalledTimes(2);
  });
});

describe("Vercel errors that retrying can't fix", () => {
  const payloadOf = (keys: string[]) =>
    ({
      flatten: () => Object.fromEntries(keys.map((key) => [key, { value: "value" }]))
    }) as unknown as TSecretSyncPayload;
  const vercelError = (code: string) =>
    new AxiosError("bad request", "ERR_BAD_REQUEST", undefined, undefined, {
      status: 400,
      statusText: "Bad Request",
      headers: {},
      config: { headers: new AxiosHeaders() },
      data: { error: { code, message: "Vercel rejected the request" } }
    });
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
  });
  it.each([
    ["BAD_REQUEST", false],
    ["env_key_invalid_characters", false],
    ["envs_size_too_large", false],
    ["some_other_error", true]
  ])("sets shouldRetry and the message when a create fails with %s", async (code, shouldRetry) => {
    get.mockResolvedValue({ data: { envs: [] } });
    post.mockRejectedValue(vercelError(code));
    const error = await VercelSyncFns.syncSecrets(sync, payloadOf(["API_KEY"])).catch((err: unknown) => err);
    expect(error).toMatchObject({
      shouldRetry,
      secretKey: "API_KEY",
      message: shouldRetry ? "" : "Vercel rejected the request"
    });
  });
  it("stops retrying a read that fails with a listed code", async () => {
    get.mockRejectedValue(vercelError("bad_request"));
    const result = VercelSyncFns.getSecrets(sync);
    await expect(result).rejects.toBeInstanceOf(SecretSyncError);
    await expect(result).rejects.toMatchObject({ shouldRetry: false });
    expect(get).toHaveBeenCalledTimes(1);
  });
});
