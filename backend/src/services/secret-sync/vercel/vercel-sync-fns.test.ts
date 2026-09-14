import { AxiosError, AxiosHeaders } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VercelEnvironmentType, VercelSyncScope } from "./vercel-sync-enums";
import { VercelSyncFns } from "./vercel-sync-fns";
import { TVercelSyncWithCredentials } from "./vercel-sync-types";

vi.mock("@app/lib/config/env", () => ({ getConfig: () => ({}) }));

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@app/lib/config/request", () => ({ request: { get } }));
vi.mock("@app/services/secret-sync/secret-sync-fns", () => ({ matchesSchema: vi.fn() }));

describe("Vercel retry error handling", () => {
  const sync = {
    destinationConfig: { scope: VercelSyncScope.Project, app: "project", env: VercelEnvironmentType.Production },
    connection: { credentials: { apiToken: "test-token" } }
  } as TVercelSyncWithCredentials;
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
  const rateLimitError = () =>
    new AxiosError("rate limited", "ERR_BAD_REQUEST", undefined, undefined, {
      status: 429,
      statusText: "Too Many Requests",
      headers: {},
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
});
