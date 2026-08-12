import { beforeEach, describe, expect, test, vi } from "vitest";

import { TAuditLogs } from "@app/db/schemas";

import { SplunkProviderFactory } from "./splunk-provider-factory";
import { TSplunkProviderCredentials } from "./splunk-provider-types";

const { sentRequests } = vi.hoisted(() => ({
  sentRequests: [] as { body: string; contentType: string }[]
}));

vi.mock("@app/lib/config/env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/lib/config/env")>()),
  getConfig: () => ({ SITE_URL: "https://app.infisical.com", AUDIT_LOG_STREAM_ALLOW_INTERNAL_IP: false })
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

// A real axios instance with a capturing adapter, because the adapter receives `config.data`
// *after* transformRequest has run — so these assertions are on the actual on-wire bytes.
// Spying on `request.post` instead would only prove what we handed axios, and the bug this
// file guards is axios re-encoding a body that was already correct at the call site.
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

// Reads a HEC body the way a collector does: a stream of concatenated JSON objects with no
// separator. Returns the events it could frame, so a body that was re-encoded into a single
// quoted string yields none.
const readConcatenatedJson = (raw: string): Record<string, unknown>[] => {
  const events: Record<string, unknown>[] = [];
  let start = 0;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < raw.length; i += 1) {
    const char = raw[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
    } else if (char === '"') {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        events.push(JSON.parse(raw.slice(start, i + 1)) as Record<string, unknown>);
        start = i + 1;
      }
    }
  }

  return events;
};

const CREDENTIALS: TSplunkProviderCredentials = { hostname: "hec.example.com", token: "hec-token" };

// createdAt is a string, not a Date: the payload reaches a provider after a jsonb round trip
// through the outbox, so that is the shape production actually delivers.
const buildLog = (idx: number) =>
  ({
    id: `log-${idx}`,
    event: { type: "get-secrets" },
    createdAt: new Date(Date.UTC(2026, 5, 11, 22, 7, 30, 732) + idx * 1_000).toISOString()
  }) as unknown as TAuditLogs;

describe("SplunkProviderFactory batchStreamLog", () => {
  beforeEach(() => {
    sentRequests.length = 0;
  });

  test("sends nothing for an empty batch", async () => {
    await SplunkProviderFactory().batchStreamLog({ credentials: CREDENTIALS, auditLogs: [] });

    expect(sentRequests).toHaveLength(0);
  });

  // 1 event happens to survive axios' default transform (the body parses as JSON, so it is
  // passed through); 2+ is where the re-encoding hit, so batch sizes are covered either side
  // of that boundary.
  test.each([1, 2, 3, 28])("sends %i event(s) as concatenated JSON objects", async (count) => {
    const auditLogs = Array.from({ length: count }, (_, i) => buildLog(i));

    await SplunkProviderFactory().batchStreamLog({ credentials: CREDENTIALS, auditLogs });

    expect(sentRequests).toHaveLength(1);
    const { body, contentType } = sentRequests[0];

    // HEC requires a JSON content type, which is what makes axios' default transform apply.
    expect(contentType).toBe("application/json");
    expect(body.startsWith('"')).toBe(false);
    expect(body).not.toContain('\\"');

    const events = readConcatenatedJson(body);
    expect(events).toHaveLength(count);
    expect(events.map((entry) => entry.event)).toEqual(auditLogs);
    events.forEach((entry) => {
      expect(entry).toMatchObject({ source: "infisical", sourcetype: "_json", host: "app.infisical.com" });
      expect(typeof entry.time).toBe("number");
    });
  });

  // HEC only reads the event timestamp from `time`, and wants UNIX `<sec>.<ms>` (its own
  // example is 1433188255.500). 1781215650.732 is 2026-06-11T22:07:30.732Z, buildLog(0)'s
  // createdAt. Both input shapes are covered because production produces both: a Date on the
  // live path, an ISO string once the payload has been through the outbox's jsonb column.
  test.each([
    ["an ISO string", (idx: number) => buildLog(idx)],
    [
      "a Date",
      (idx: number) =>
        ({
          ...buildLog(idx),
          createdAt: new Date(buildLog(idx).createdAt as unknown as string)
        }) as unknown as TAuditLogs
    ]
  ])("stamps HEC time from the event's createdAt (%s), not the time of delivery", async (_label, build) => {
    const auditLogs = [build(0), build(1)];

    await SplunkProviderFactory().batchStreamLog({ credentials: CREDENTIALS, auditLogs });

    const events = readConcatenatedJson(sentRequests[0].body);
    expect(events.map((entry) => entry.time)).toEqual([1781215650.732, 1781215651.732]);
  });

  test("ignores an unparseable createdAt rather than emitting a null timestamp", async () => {
    const before = Date.now() / 1000;
    const auditLog = { id: "log-x", event: {}, createdAt: "not-a-date" } as unknown as TAuditLogs;

    await SplunkProviderFactory().batchStreamLog({ credentials: CREDENTIALS, auditLogs: [auditLog] });

    const [entry] = readConcatenatedJson(sentRequests[0].body);
    expect(typeof entry.time).toBe("number");
    expect(entry.time as number).toBeGreaterThanOrEqual(before);
  });

  test("falls back to the current time when the log carries no createdAt", async () => {
    const before = Date.now() / 1000;
    const auditLog = { id: "log-x", event: { type: "get-secrets" } } as unknown as TAuditLogs;

    await SplunkProviderFactory().batchStreamLog({ credentials: CREDENTIALS, auditLogs: [auditLog] });

    const [entry] = readConcatenatedJson(sentRequests[0].body);
    expect(entry.time as number).toBeGreaterThanOrEqual(before);
    expect(entry.time as number).toBeLessThanOrEqual(Date.now() / 1000);
  });
});
