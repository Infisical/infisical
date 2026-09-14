import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RateLimitError } from "@app/lib/errors";

import { ChecklyPublicAPI } from "./checkly-connection-public-client";
import { TChecklyConnectionConfig } from "./checkly-connection-types";

vi.mock("@app/lib/config/env", () => ({ getConfig: () => ({}) }));

const { requestMock } = vi.hoisted(() => ({ requestMock: vi.fn() }));
vi.mock("@app/lib/config/request", () => ({ createRequestClient: () => ({ request: requestMock }) }));

// Exercise a public write method: a 429 body must never be returned as a successful write.
describe("Checkly retry exhaustion", () => {
  const connection = { method: "api-key", credentials: { apiKey: "test-token" } } as TChecklyConnectionConfig;
  const write = () =>
    ChecklyPublicAPI.createVariable(connection, "account", { key: "KEY", value: "value", locked: true, secret: true });
  beforeEach(() => {
    vi.useFakeTimers();
    requestMock.mockReset();
  });
  afterEach(() => vi.useRealTimers());
  it("rejects a write after three retries instead of returning the 429 payload", async () => {
    requestMock.mockResolvedValue({ status: 429, headers: {}, data: { error: "rate limited" } });
    const assertion = expect(write()).rejects.toBeInstanceOf(RateLimitError);
    await vi.runAllTimersAsync();
    await assertion;
    expect(requestMock).toHaveBeenCalledTimes(4);
  });
  it("returns the successful write response when a retry recovers", async () => {
    const data = { key: "KEY" };
    requestMock
      .mockResolvedValueOnce({ status: 429, headers: {}, data: {} })
      .mockResolvedValue({ status: 200, headers: {}, data });
    const result = write();
    await vi.runAllTimersAsync();
    await expect(result).resolves.toEqual(data);
    expect(requestMock).toHaveBeenCalledTimes(2);
  });
  it("preserves non-rate-limit request failures", async () => {
    const error = new Error("connection reset");
    requestMock.mockRejectedValue(error);
    await expect(write()).rejects.toBe(error);
    expect(requestMock).toHaveBeenCalledTimes(1);
  });
});
