import { AxiosError, AxiosResponse } from "axios";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { BadRequestError } from "@app/lib/errors";

import {
  getIncidentIoErrorMessage,
  listIncidentIoSchedules,
  listIncidentIoShiftsAt
} from "./incident-io-connection-fns";

const { mockedGet } = vi.hoisted(() => ({
  mockedGet: vi.fn<(url: string, config?: { params?: Record<string, unknown> }) => Promise<{ data: unknown }>>()
}));
vi.mock("@app/lib/config/request", () => ({ request: { get: mockedGet } }));
const config = { credentials: { apiKey: "key" } };

const entry = (start: string, end: string, email?: string) => ({
  start_at: start,
  end_at: end,
  user: { id: "u1", name: "User", email }
});

const upstreamError = (status: number) =>
  new AxiosError("Request failed", "ERR_BAD_REQUEST", undefined, undefined, { status } as AxiosResponse);

describe("listIncidentIoShiftsAt", () => {
  const at = new Date("2026-11-06T12:00:00Z");

  beforeEach(() => mockedGet.mockReset());

  test("reads the override-merged entries, counting a shift from its start up to its end", async () => {
    mockedGet.mockResolvedValue({
      data: {
        schedule_entries: {
          scheduled: [entry("2026-11-06T00:00:00Z", "2026-11-07T00:00:00Z", "replaced@acme.com")],
          final: [
            entry("2026-11-06T12:00:00Z", "2026-11-06T18:00:00Z", "starts-now@acme.com"),
            entry("2026-11-06T06:00:00Z", "2026-11-06T12:00:00Z", "ended-now@acme.com"),
            entry("2026-11-06T12:00:01Z", "2026-11-06T18:00:00Z", "later@acme.com")
          ]
        }
      }
    });

    const shifts = await listIncidentIoShiftsAt(config, "S1", at);

    expect(shifts.map((shift) => shift.user?.email)).toEqual(["starts-now@acme.com"]);
    expect(mockedGet.mock.calls[0][1]?.params).toMatchObject({
      schedule_id: "S1",
      entry_window_start: "2026-11-06T12:00:00.000Z"
    });
  });

  test("returns no shifts when the response has no final entries", async () => {
    mockedGet.mockResolvedValue({ data: {} });
    expect(await listIncidentIoShiftsAt(config, "S1", at)).toEqual([]);
  });
});

describe("listIncidentIoSchedules", () => {
  beforeEach(() => mockedGet.mockReset());

  test("follows the cursor until incident.io stops returning one", async () => {
    mockedGet
      .mockResolvedValueOnce({ data: { schedules: [{ id: "S1", name: "Primary" }], pagination_meta: { after: "S1" } } })
      .mockResolvedValueOnce({ data: { schedules: [{ id: "S2", name: "Secondary" }], pagination_meta: {} } });

    expect(await listIncidentIoSchedules(config)).toEqual([
      { id: "S1", name: "Primary" },
      { id: "S2", name: "Secondary" }
    ]);
    expect(mockedGet.mock.calls[1][1]?.params).toMatchObject({ after: "S1" });
  });

  test("refuses to return a partial list when the cursor never clears", async () => {
    mockedGet.mockResolvedValue({
      data: { schedules: [{ id: "S1", name: "Primary" }], pagination_meta: { after: "S1" } }
    });
    await expect(listIncidentIoSchedules(config)).rejects.toThrow(BadRequestError);
  });
});

describe("getIncidentIoErrorMessage", () => {
  test("names the credential problem instead of the status code", () => {
    expect(getIncidentIoErrorMessage(upstreamError(401))).toBe("incident.io rejected the connection's API key");
    expect(getIncidentIoErrorMessage(upstreamError(403))).toContain("View on-call resources");
  });
});
