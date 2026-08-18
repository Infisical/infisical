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
import { telemetryServiceFactory } from "./telemetry-service";

// streamCollect returns [entryId, ["data", json]] tuples; the consumer parses fields[1].
const collectResult = (payloads: Record<string, unknown>[], lastId = "9-0") => ({
  entries: payloads.map((p, i) => [`${i + 1}-0`, ["data", JSON.stringify(p)]] as [string, string[]]),
  lastId
});

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

    expect(keyStore.streamTrim).toHaveBeenCalledTimes(1);
    expect(keyStore.streamTrim).toHaveBeenCalledWith(streamKey, "7-0", true);
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

    expect(keyStore.streamTrim).not.toHaveBeenCalled();
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
});
