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

// The real helper resolves the hostname to check it isn't internal, which needs DNS.
vi.mock("../audit-log-stream-fns", () => ({
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

const buildLog = (idx: number) => ({ id: `log-${idx}`, event: { type: "get-secrets" } }) as unknown as TAuditLogs;

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
});
