import { beforeEach, describe, expect, test, vi } from "vitest";

import { PostHogEventTypes } from "./telemetry-types";

const mockConfig = {
  isProductionMode: true,
  TELEMETRY_ENABLED: true,
  POSTHOG_PROJECT_API_KEY: "phc_test",
  POSTHOG_HOST: "https://posthog.test",
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

const postHogClient = {
  capture: vi.fn(),
  groupIdentify: vi.fn(),
  identify: vi.fn(),
  shutdown: vi.fn(async () => undefined)
};

vi.mock("posthog-node", () => ({
  PostHog: vi.fn(() => postHogClient)
}));

// eslint-disable-next-line import/first
import { POSTHOG_AGGREGATED_EVENTS, telemetryServiceFactory } from "./telemetry-service";

const RETENTION_MS = 30 * 60 * 1000;
const KEY_TTL_SECONDS = 60 * 60;
const BUCKET_COUNT = 30;
const SHARD_COUNT = POSTHOG_AGGREGATED_EVENTS.length * BUCKET_COUNT;

// streamCollect returns [entryId, ["data", json]] tuples; the consumer parses fields[1].
const collectResult = (payloads: Record<string, unknown>[], lastId = "9-0") => ({
  entries: payloads.map((p, i) => [`${i + 1}-0`, ["data", JSON.stringify(p)]] as [string, string[]]),
  lastId
});

// The drain trim passes `inclusive`; the retention trim that runs on every shard does not.
const drainTrims = (keyStore: { streamTrim: { mock: { calls: unknown[][] } } }) =>
  keyStore.streamTrim.mock.calls.filter((call) => call[2] === true);

const retentionTrims = (keyStore: { streamTrim: { mock: { calls: unknown[][] } } }) =>
  keyStore.streamTrim.mock.calls.filter((call) => call[2] === undefined) as [string, string][];

const pulledEvent = (overrides: Record<string, unknown> = {}) => ({
  distinctId: "user-1",
  event: PostHogEventTypes.SecretPulled,
  properties: { numberOfSecrets: 3, environment: "prod" },
  organizationId: "org-1",
  ...overrides
});

const createHarness = () => {
  const keyStore = {
    incrementBy: vi.fn<(key: string, value: number) => Promise<number>>(async () => 1),
    setItemWithExpiryNX: vi.fn<() => Promise<"OK" | null>>(async () => null),
    setExpiry: vi.fn<(key: string, expiryInSeconds: number) => Promise<number>>(async () => 1),
    streamAdd: vi.fn<
      (key: string, id: string, fieldValue: Record<string, string>, maxLen?: number) => Promise<string | null>
    >(async () => "1-0"),
    streamCollect: vi.fn<(key: string) => Promise<{ entries: [string, string[]][]; lastId: string | null }>>(
      async () => ({ entries: [], lastId: null })
    ),
    streamTrim: vi.fn<(key: string, minId: string, inclusive?: boolean) => Promise<number>>(async () => 0)
  };

  const telemetryService = telemetryServiceFactory({
    keyStore: keyStore as never,
    licenseService: { getInstanceType: vi.fn(() => "cloud"), getPlan: vi.fn() } as never,
    orgDAL: { findOrgById: vi.fn() } as never,
    emailDomainDAL: { find: vi.fn(async () => []) } as never
  });

  return { keyStore, telemetryService };
};

describe("telemetry aggregated event storage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("appends an aggregated event to its shard stream instead of a per-event key", async () => {
    const { keyStore, telemetryService } = createHarness();

    await telemetryService.sendPostHogEvents(pulledEvent() as never);

    expect(keyStore.streamAdd).toHaveBeenCalledTimes(1);
    const [key, id, fields, maxLen] = keyStore.streamAdd.mock.calls[0];
    expect(key).toBe(
      `telemetry-agg-stream:${PostHogEventTypes.SecretPulled}:${telemetryService.getBucketForDistinctId("user-1")}`
    );
    expect(id).toBe("*");
    expect(maxLen).toBeGreaterThan(0);
    expect(JSON.parse(fields.data)).toMatchObject({
      distinctId: "user-1",
      event: PostHogEventTypes.SecretPulled,
      organizationId: "org-1"
    });
    // The event must not be captured directly — it is aggregated by the cron.
    expect(postHogClient.capture).not.toHaveBeenCalled();
  });

  test("all events for one distinctId land on the same shard", async () => {
    const { keyStore, telemetryService } = createHarness();

    await telemetryService.sendPostHogEvents(pulledEvent({ properties: { numberOfSecrets: 1 } }) as never);
    await telemetryService.sendPostHogEvents(pulledEvent({ properties: { numberOfSecrets: 2 } }) as never);

    const keys = keyStore.streamAdd.mock.calls.map((call) => call[0]);
    expect(new Set(keys).size).toBe(1);
  });

  test("drains a shard by key, then trims what it published", async () => {
    const { keyStore, telemetryService } = createHarness();
    const bucketId = telemetryService.getBucketForDistinctId("user-1");
    const streamKey = `telemetry-agg-stream:${PostHogEventTypes.SecretPulled}:${bucketId}`;

    keyStore.streamCollect.mockImplementation(async (key) =>
      key === streamKey
        ? collectResult([pulledEvent(), pulledEvent({ properties: { numberOfSecrets: 4 } })], "7-0")
        : { entries: [], lastId: null }
    );

    await telemetryService.processAggregatedEvents();

    const captures = postHogClient.capture.mock.calls.map(([arg]) => arg as Record<string, unknown>);
    expect(captures).toHaveLength(1);
    expect(captures[0]).toMatchObject({
      event: `${PostHogEventTypes.SecretPulled} aggregated`,
      distinctId: "user-1"
    });
    expect(captures[0].properties).toMatchObject({ count: 2, numberOfSecrets: 7, orgId: "org-1" });

    expect(drainTrims(keyStore)).toEqual([[streamKey, "7-0", true]]);
  });

  test("attempts the hourly groupIdentify claim once per org, not once per actor", async () => {
    const { keyStore, telemetryService } = createHarness();
    keyStore.setItemWithExpiryNX.mockResolvedValue("OK");

    // Four actors, two orgs, spread across whichever shards their distinctIds hash to.
    const byShard = new Map<string, Record<string, unknown>[]>();
    for (const [distinctId, organizationId] of [
      ["user-1", "org-1"],
      ["user-2", "org-1"],
      ["user-3", "org-2"],
      ["user-4", "org-2"]
    ]) {
      const shard = `telemetry-agg-stream:${PostHogEventTypes.SecretPulled}:${telemetryService.getBucketForDistinctId(distinctId)}`;
      byShard.set(shard, [...(byShard.get(shard) ?? []), pulledEvent({ distinctId, organizationId })]);
    }

    keyStore.streamCollect.mockImplementation(async (key) => {
      const payloads = byShard.get(key);
      return payloads ? collectResult(payloads) : { entries: [], lastId: null };
    });

    await telemetryService.processAggregatedEvents();

    expect(postHogClient.capture).toHaveBeenCalledTimes(4);
    expect(keyStore.setItemWithExpiryNX).toHaveBeenCalledTimes(2);
    expect(postHogClient.groupIdentify).toHaveBeenCalledTimes(2);
    expect(
      postHogClient.groupIdentify.mock.calls.map(([arg]) => (arg as { groupKey: string }).groupKey).sort()
    ).toEqual(["org-1", "org-2"]);
  });

  test("leaves the shard untrimmed when publishing fails, so the batch is retried", async () => {
    const { keyStore, telemetryService } = createHarness();

    keyStore.streamCollect.mockResolvedValueOnce(collectResult([pulledEvent()]));
    postHogClient.capture.mockImplementationOnce(() => {
      throw new Error("posthog down");
    });

    await telemetryService.processAggregatedEvents();

    expect(drainTrims(keyStore)).toHaveLength(0);
  });

  test("skips an unparseable entry rather than dropping the whole shard", async () => {
    const { keyStore, telemetryService } = createHarness();

    keyStore.streamCollect.mockResolvedValueOnce({
      entries: [
        ["1-0", ["data", "{not json"]],
        ["2-0", ["data", JSON.stringify(pulledEvent())]]
      ],
      lastId: "2-0"
    });

    await telemetryService.processAggregatedEvents();

    expect(postHogClient.capture).toHaveBeenCalledTimes(1);
    expect(keyStore.streamTrim).toHaveBeenCalledWith(expect.any(String), "2-0", true);
  });

  test("ages every shard out to the retention window on each run", async () => {
    const { keyStore, telemetryService } = createHarness();

    const startedAt = Date.now();
    await telemetryService.processAggregatedEvents();
    const trims = retentionTrims(keyStore);

    // Exactly one trim per (event type, bucket), covering every bucket.
    expect(trims).toHaveLength(SHARD_COUNT);
    expect(new Set(trims.map(([key]) => key)).size).toBe(SHARD_COUNT);
    expect(new Set(trims.map(([key]) => key.split(":").pop())).size).toBe(BUCKET_COUNT);

    for (const [, minId] of trims) {
      const [timestamp, sequence] = minId.split("-");
      expect(sequence).toBe("0");
      expect(Number(timestamp)).toBeGreaterThanOrEqual(startedAt - RETENTION_MS);
      expect(Number(timestamp)).toBeLessThanOrEqual(Date.now() - RETENTION_MS);
    }
  });

  test("ages the shard out even when publishing fails", async () => {
    const { keyStore, telemetryService } = createHarness();

    keyStore.streamCollect.mockResolvedValueOnce(collectResult([pulledEvent()]));
    postHogClient.capture.mockImplementationOnce(() => {
      throw new Error("posthog down");
    });

    await telemetryService.processAggregatedEvents();

    // Retention must not be coupled to the drain: a shard whose publish throws on every tick would
    // otherwise grow until MAXLEN evicts it, with nothing bounding how long it sits in Redis.
    expect(drainTrims(keyStore)).toHaveLength(0);
    expect(retentionTrims(keyStore)).toHaveLength(SHARD_COUNT);
  });

  test("bounds how many shards it holds in memory at once", async () => {
    const { keyStore, telemetryService } = createHarness();

    // The per-shard collection ceiling only bounds the cron's footprint if the number of shards
    // in flight is bounded too, and nothing else in the run observes that.
    let inFlight = 0;
    let peakInFlight = 0;
    keyStore.streamCollect.mockImplementation(async () => {
      inFlight += 1;
      peakInFlight = Math.max(peakInFlight, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return collectResult([pulledEvent()]);
    });

    await telemetryService.processAggregatedEvents();

    expect(keyStore.streamCollect).toHaveBeenCalledTimes(SHARD_COUNT);
    expect(peakInFlight).toBeGreaterThan(0);
    expect(peakInFlight).toBeLessThanOrEqual(2);
  });

  test("refreshes the key expiry on every shard so an orphaned shard self-cleans", async () => {
    const { keyStore, telemetryService } = createHarness();

    await telemetryService.processAggregatedEvents();

    const { calls } = keyStore.setExpiry.mock;
    expect(calls).toHaveLength(SHARD_COUNT);
    expect(new Set(calls.map(([key]) => key)).size).toBe(SHARD_COUNT);
    // The TTL only ever reaps a shard this run no longer visits. On a shard that is still written,
    // the age trim has to be what drops entries, so the TTL must outlive the retention window.
    for (const [, ttlSeconds] of calls) {
      expect(ttlSeconds).toBe(KEY_TTL_SECONDS);
      expect(ttlSeconds * 1000).toBeGreaterThan(RETENTION_MS);
    }
  });

  test("refreshes the key expiry even when publishing fails", async () => {
    const { keyStore, telemetryService } = createHarness();

    keyStore.streamCollect.mockResolvedValueOnce(collectResult([pulledEvent()]));
    postHogClient.capture.mockImplementationOnce(() => {
      throw new Error("posthog down");
    });

    await telemetryService.processAggregatedEvents();

    expect(drainTrims(keyStore)).toHaveLength(0);
    expect(keyStore.setExpiry).toHaveBeenCalledTimes(SHARD_COUNT);
  });

  test("drains a shard whose expiry refresh fails", async () => {
    const { keyStore, telemetryService } = createHarness();
    const bucketId = telemetryService.getBucketForDistinctId("user-1");
    const streamKey = `telemetry-agg-stream:${PostHogEventTypes.SecretPulled}:${bucketId}`;

    keyStore.setExpiry.mockImplementation(async (key) => {
      if (key === streamKey) throw new Error("redis hiccup");
      return 1;
    });
    keyStore.streamCollect.mockImplementation(async (key) =>
      key === streamKey ? collectResult([pulledEvent()], "3-0") : { entries: [], lastId: null }
    );

    await telemetryService.processAggregatedEvents();

    expect(postHogClient.capture).toHaveBeenCalledTimes(1);
    expect(retentionTrims(keyStore)).toHaveLength(SHARD_COUNT);
    expect(drainTrims(keyStore)).toEqual([[streamKey, "3-0", true]]);
  });

  test("drains a shard whose retention trim fails", async () => {
    const { keyStore, telemetryService } = createHarness();
    const bucketId = telemetryService.getBucketForDistinctId("user-1");
    const streamKey = `telemetry-agg-stream:${PostHogEventTypes.SecretPulled}:${bucketId}`;

    keyStore.streamTrim.mockImplementation(async (key, _minId, inclusive) => {
      if (key === streamKey && inclusive === undefined) throw new Error("redis hiccup");
      return 0;
    });
    keyStore.streamCollect.mockImplementation(async (key) =>
      key === streamKey ? collectResult([pulledEvent()], "3-0") : { entries: [], lastId: null }
    );

    await telemetryService.processAggregatedEvents();

    expect(postHogClient.capture).toHaveBeenCalledTimes(1);
    expect(drainTrims(keyStore)).toEqual([[streamKey, "3-0", true]]);
  });
});
