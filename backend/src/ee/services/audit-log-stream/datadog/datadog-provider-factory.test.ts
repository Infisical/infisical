import { beforeEach, describe, expect, test, vi } from "vitest";

import { TAuditLogs } from "@app/db/schemas";

import { DatadogProviderFactory } from "./datadog-provider-factory";
import { TDatadogProviderCredentials } from "./datadog-provider-types";

const { sentRequests } = vi.hoisted(() => ({
  sentRequests: [] as { body: string; contentType: string }[]
}));

vi.mock("@app/lib/config/env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/lib/config/env")>()),
  getConfig: () => ({
    SITE_URL: "https://app.infisical.com",
    NODE_ENV: "production",
    AUDIT_LOG_STREAM_ALLOW_INTERNAL_IP: false
  })
}));

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

// Only the hostname check is stubbed, because the real one needs DNS. resolveEventTimestamp
// stays real so the timestamp assertions exercise actual behaviour.
vi.mock("../audit-log-stream-fns", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../audit-log-stream-fns")>()),
  blockAuditLogStreamInternalIps: vi.fn(async () => undefined)
}));

// Captures the body post-transformRequest, i.e. the exact bytes that go on the wire.
vi.mock("@app/lib/config/request", async () => {
  const { default: axios } = await vi.importActual<typeof import("axios")>("axios");

  return {
    request: axios.create({
      adapter: async (config) => {
        sentRequests.push({
          body: config.data as string,
          contentType: String(config.headers["Content-Type"])
        });

        return { data: {}, status: 200, statusText: "OK", headers: {}, config };
      }
    })
  };
});

const CREDENTIALS: TDatadogProviderCredentials = {
  url: "https://http-intake.logs.datadoghq.com/api/v2/logs",
  token: "dd-api-key"
} as TDatadogProviderCredentials;

const buildLog = (idx: number) =>
  ({
    id: `log-${idx}`,
    event: { type: "get-secrets" },
    createdAt: new Date(Date.UTC(2026, 5, 11, 22, 7, 30, 732) + idx * 1_000).toISOString()
  }) as unknown as TAuditLogs;

describe("DatadogProviderFactory batchStreamLog", () => {
  beforeEach(() => {
    sentRequests.length = 0;
  });

  test("sends nothing for an empty batch", async () => {
    await DatadogProviderFactory().batchStreamLog({ credentials: CREDENTIALS, auditLogs: [] });

    expect(sentRequests).toHaveLength(0);
  });

  test("sends a JSON array of events, one entry per log", async () => {
    const auditLogs = [buildLog(0), buildLog(1), buildLog(2)];

    await DatadogProviderFactory().batchStreamLog({ credentials: CREDENTIALS, auditLogs });

    expect(sentRequests).toHaveLength(1);
    const { body, contentType } = sentRequests[0];
    expect(contentType).toBe("application/json");
    expect(body.startsWith("[")).toBe(true);

    const events = JSON.parse(body) as Record<string, unknown>[];
    expect(events).toHaveLength(3);
    expect(events.map((entry) => entry.id)).toEqual(["log-0", "log-1", "log-2"]);
    events.forEach((entry) =>
      expect(entry).toMatchObject({
        ddsource: "infisical",
        service: "infisical",
        ddtags: "env:production",
        hostname: "app.infisical.com"
      })
    );
  });

  // Datadog's date remapper reads `timestamp` but not `createdAt`, so without this field the
  // log is stamped when Datadog receives it rather than when the event happened.
  test("carries a remappable timestamp taken from the event's createdAt", async () => {
    const auditLogs = [buildLog(0), buildLog(1)];

    await DatadogProviderFactory().batchStreamLog({ credentials: CREDENTIALS, auditLogs });

    const events = JSON.parse(sentRequests[0].body) as Record<string, unknown>[];
    expect(events.map((entry) => entry.timestamp)).toEqual(["2026-06-11T22:07:30.732Z", "2026-06-11T22:07:31.732Z"]);
  });

  test("falls back to the current time when the log carries no createdAt", async () => {
    const before = Date.now();
    const auditLog = { id: "log-x", event: { type: "get-secrets" } } as unknown as TAuditLogs;

    await DatadogProviderFactory().batchStreamLog({ credentials: CREDENTIALS, auditLogs: [auditLog] });

    const [entry] = JSON.parse(sentRequests[0].body) as Record<string, unknown>[];
    const stamped = Date.parse(entry.timestamp as string);
    expect(stamped).toBeGreaterThanOrEqual(before);
    expect(stamped).toBeLessThanOrEqual(Date.now());
  });
});
