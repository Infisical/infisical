import { createServer, Server } from "node:http";
import { AddressInfo } from "node:net";
import { gunzipSync } from "node:zlib";

import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

import { PostHogEventTypes } from "./telemetry-types";

// Deliberately NOT mocking posthog-node. The drain trims a shard on the strength of what the SDK did
// with the batch, and that behaviour lives in the SDK's timing, not in our call order: capture()
// enqueues from a promise chain, and its queue evicts the oldest entry once full. A mocked client
// cannot see either, so an SDK upgrade that changes them would break delivery with every unit test
// still green. These tests watch the wire instead.

const received: { events: Record<string, unknown>[]; requests: number } = { events: [], requests: 0 };
let server: Server;
let host: string;

const mockConfig = {
  isProductionMode: true,
  TELEMETRY_ENABLED: true,
  POSTHOG_PROJECT_API_KEY: "phc_test",
  POSTHOG_HOST: "",
  INFISICAL_CLOUD: true,
  INFISICAL_DEDICATED: false,
  INTERNAL_REGION: "us"
};

vi.mock("@app/lib/config/env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/lib/config/env")>()),
  getConfig: () => mockConfig
}));

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

vi.mock("@fastify/request-context", () => ({
  requestContext: { get: vi.fn(() => undefined) }
}));

// eslint-disable-next-line import/first
import { telemetryServiceFactory } from "./telemetry-service";

const pulledEvent = (distinctId: string) => ({
  distinctId,
  event: PostHogEventTypes.SecretPulled,
  properties: { numberOfSecrets: 1 },
  organizationId: "org-1"
});

const createHarness = (payloads: Record<string, unknown>[]) => {
  const trims: { deliveredEventsAtTrim: number }[] = [];
  const keyStore = {
    incrementBy: vi.fn(async () => 1),
    setItemWithExpiryNX: vi.fn(async () => null),
    setExpiry: vi.fn(async () => 1),
    streamAdd: vi.fn(async () => "1-0"),
    streamLength: vi.fn(async () => 0),
    streamCollect: vi.fn(async (key: string) =>
      key === `telemetry-agg-stream:${PostHogEventTypes.SecretPulled}:bucket-00`
        ? {
            entries: payloads.map((p, i) => [`${i + 1}-0`, ["data", JSON.stringify(p)]] as [string, string[]]),
            lastId: `${payloads.length}-0`
          }
        : { entries: [], lastId: null }
    ),
    streamTrim: vi.fn(async (_key: string, _minId: string, inclusive?: boolean) => {
      if (inclusive) trims.push({ deliveredEventsAtTrim: received.events.length });
      return 0;
    })
  };

  const telemetryService = telemetryServiceFactory({
    keyStore: keyStore as never,
    licenseService: { getInstanceType: vi.fn(() => "cloud"), getPlan: vi.fn() } as never,
    orgDAL: { findOrgById: vi.fn() } as never,
    emailDomainDAL: { find: vi.fn(async () => []) } as never
  });

  return { telemetryService, trims };
};

describe("telemetry aggregated event delivery (real posthog-node)", () => {
  beforeAll(async () => {
    server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        const body = Buffer.concat(chunks);
        const raw = req.headers["content-encoding"] === "gzip" ? gunzipSync(body).toString() : body.toString();
        received.requests += 1;
        received.events.push(...((JSON.parse(raw) as { batch: Record<string, unknown>[] }).batch ?? []));
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end("{}");
      });
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    host = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    mockConfig.POSTHOG_HOST = host;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  beforeEach(() => {
    received.events = [];
    received.requests = 0;
    vi.clearAllMocks();
  });

  // capture() resolves a promise chain before it enqueues, so a flush in the same tick sends nothing
  // and still resolves. The shard would then be trimmed on a delivery that never happened.
  test("puts the batch on the wire before the shard is trimmed", async () => {
    const { telemetryService, trims } = createHarness([pulledEvent("user-1"), pulledEvent("user-2")]);

    await telemetryService.processAggregatedEvents();

    expect(received.events).toHaveLength(2);
    expect(trims).toHaveLength(1);
    expect(trims[0].deliveredEventsAtTrim).toBe(2);
    await telemetryService.flushAll();
  });

  // The SDK queues 1000 by default and drops the OLDEST on overflow, logged at info. One drain
  // publishes an event per aggregation group with nothing draining in between.
  test("delivers every aggregation group when a shard exceeds the SDK's default queue size", async () => {
    const groups = 1200;
    const { telemetryService } = createHarness(Array.from({ length: groups }, (_, i) => pulledEvent(`user-${i}`)));

    await telemetryService.processAggregatedEvents();

    expect(received.events).toHaveLength(groups);
    expect(received.requests).toBeGreaterThan(1);
    await telemetryService.flushAll();
  });
});
