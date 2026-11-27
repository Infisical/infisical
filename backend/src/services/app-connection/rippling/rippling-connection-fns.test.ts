import { AxiosError, AxiosResponse } from "axios";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { BadRequestError } from "@app/lib/errors";

import {
  getRipplingDeviceBySerial,
  getRipplingWorkerByEmail,
  validateRipplingConnectionCredentials
} from "./rippling-connection-fns";
import { TRipplingConnection, TRipplingConnectionConfig } from "./rippling-connection-types";

const { mockedGet } = vi.hoisted(() => ({
  mockedGet:
    vi.fn<
      (
        url: string,
        config?: { params?: Record<string, unknown>; headers?: Record<string, string> }
      ) => Promise<{ data: unknown }>
    >()
}));
vi.mock("@app/lib/config/request", () => ({ request: { get: mockedGet } }));

const connection = { credentials: { apiToken: "tok" } } as TRipplingConnection;

const upstreamError = (status: number) =>
  new AxiosError("Request failed", "ERR_BAD_REQUEST", undefined, undefined, { status } as AxiosResponse);

describe("getRipplingDeviceBySerial", () => {
  beforeEach(() => mockedGet.mockReset());

  test("filters by serial, expands pending actions and normalizes missing fields to null", async () => {
    mockedGet.mockResolvedValue({
      data: {
        results: [
          {
            id: "d1",
            serial_number: "C02XYZ",
            worker_id: "w1",
            is_managed: true,
            is_encrypted: false,
            pending_actions: [{ action_type: "LOCK", state: "PENDING" }, { state: "x" }]
          }
        ],
        next_link: null
      }
    });

    const device = await getRipplingDeviceBySerial(connection, " C02XYZ ");

    expect(device).toMatchObject({
      id: "d1",
      serial_number: "C02XYZ",
      worker_id: "w1",
      platform: null,
      os_version: null,
      is_managed: true,
      is_encrypted: false,
      last_checkin_at: null,
      pending_actions: [{ action_type: "LOCK", state: "PENDING" }]
    });
    const [url, config] = mockedGet.mock.calls[0];
    expect(url).toBe("https://rest.ripplingapis.com/devices/");
    expect(config?.params).toEqual({ filter: "serial_number eq 'C02XYZ'", expand: "pending_actions" });
    expect(config?.headers).toMatchObject({ Authorization: "Bearer tok", Accept: "application/json" });
  });

  test("returns null when no device matches", async () => {
    mockedGet.mockResolvedValue({ data: { results: [], next_link: null } });
    expect(await getRipplingDeviceBySerial(connection, "NOPE")).toBeNull();
  });

  test("rejects a serial containing a single quote without calling Rippling", async () => {
    await expect(getRipplingDeviceBySerial(connection, "AB' or 1 eq 1")).rejects.toThrow(BadRequestError);
    expect(mockedGet).not.toHaveBeenCalled();
  });

  test("maps upstream errors to readable messages", async () => {
    mockedGet.mockRejectedValueOnce(upstreamError(401));
    await expect(getRipplingDeviceBySerial(connection, "S1")).rejects.toThrow("invalid or expired");

    mockedGet.mockRejectedValueOnce(upstreamError(403));
    await expect(getRipplingDeviceBySerial(connection, "S1")).rejects.toThrow("missing devices.read");

    mockedGet.mockRejectedValueOnce(upstreamError(429));
    await expect(getRipplingDeviceBySerial(connection, "S1")).rejects.toThrow(
      "Rippling is rate limiting requests, try again shortly"
    );

    mockedGet.mockRejectedValueOnce(new AxiosError("getaddrinfo", "ENOTFOUND"));
    await expect(getRipplingDeviceBySerial(connection, "S1")).rejects.toThrow("Couldn't reach Rippling");
  });
});

describe("getRipplingWorkerByEmail", () => {
  beforeEach(() => mockedGet.mockReset());

  test("filters by work email and returns the first worker", async () => {
    mockedGet.mockResolvedValue({
      data: { results: [{ id: "w1", status: "ACTIVE", work_email: "a@acme.com", extra: 1 }] }
    });

    expect(await getRipplingWorkerByEmail(connection, "a@acme.com")).toEqual({
      id: "w1",
      status: "ACTIVE",
      work_email: "a@acme.com"
    });
    const [url, config] = mockedGet.mock.calls[0];
    expect(url).toBe("https://rest.ripplingapis.com/workers/");
    expect(config?.params).toEqual({ filter: "work_email eq 'a@acme.com'" });
  });

  test("returns null when the response has no results", async () => {
    mockedGet.mockResolvedValue({ data: {} });
    expect(await getRipplingWorkerByEmail(connection, "a@acme.com")).toBeNull();
  });

  test("rejects an email containing a single quote", async () => {
    await expect(getRipplingWorkerByEmail(connection, "o'brien@acme.com")).rejects.toThrow(BadRequestError);
    expect(mockedGet).not.toHaveBeenCalled();
  });

  test("names the workers scope on 403", async () => {
    mockedGet.mockRejectedValueOnce(upstreamError(403));
    await expect(getRipplingWorkerByEmail(connection, "a@acme.com")).rejects.toThrow(
      "The token needs the devices.read and workers.read scopes"
    );
  });
});

describe("validateRipplingConnectionCredentials", () => {
  beforeEach(() => mockedGet.mockReset());

  test("checks both devices and workers", async () => {
    mockedGet.mockResolvedValue({ data: { results: [] } });
    const config = { ...connection, orgId: "o1" } as unknown as TRipplingConnectionConfig;

    await validateRipplingConnectionCredentials(config);

    expect(mockedGet.mock.calls.map(([url]) => url)).toEqual([
      "https://rest.ripplingapis.com/devices/",
      "https://rest.ripplingapis.com/workers/"
    ]);
  });

  test("names the missing workers scope when only workers is forbidden", async () => {
    mockedGet.mockResolvedValueOnce({ data: { results: [] } }).mockRejectedValueOnce(upstreamError(403));
    const config = { ...connection, orgId: "o1" } as unknown as TRipplingConnectionConfig;

    await expect(validateRipplingConnectionCredentials(config)).rejects.toThrow("missing workers.read");
  });
});
