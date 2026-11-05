import { afterEach, describe, expect, test, vi } from "vitest";

import { QueueJobs, QueueName } from "@app/queue";

import { usageEventQueueFactory } from "./usage-event-queue";
import { usageMeteringServiceFactory } from "./usage-metering-service";
import { TUsageEvent, usageReporterFactory, UsageReportError } from "./usage-reporter";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

const ORG_ID = "11111111-1111-1111-1111-111111111111";
const SERVER_URL = "https://license.example.com";
const AT = new Date("2026-11-05T06:00:00.000Z");

const flushAsync = () =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });

const buildService = (enabled: boolean, queue = vi.fn(async () => {})) => ({
  queue,
  svc: usageMeteringServiceFactory({
    queueService: { queue },
    keyStore: { setItemWithExpiryNX: vi.fn() },
    projectDAL: { findById: vi.fn() },
    licenseClient: { isEnabled: () => enabled }
  })
});

describe("usageMeteringService.recordMeteringEvents", () => {
  test("does nothing when no license server is configured", async () => {
    const { svc, queue } = buildService(false);
    svc.recordMeteringEvents(ORG_ID, [
      { eventId: "e1", dimensionKey: "pam_session_minutes", quantity: 3, occurredAt: AT }
    ]);
    await flushAsync();
    expect(queue).not.toHaveBeenCalled();
  });

  test("does nothing for an empty batch", async () => {
    const { svc, queue } = buildService(true);
    svc.recordMeteringEvents(ORG_ID, []);
    await flushAsync();
    expect(queue).not.toHaveBeenCalled();
  });

  test("enqueues one retrying job that is never debounced, carrying each event's own occurredAt", async () => {
    const { svc, queue } = buildService(true);

    svc.recordMeteringEvents(ORG_ID, [
      { eventId: "e1", dimensionKey: "pam_session_minutes", quantity: 3, occurredAt: AT },
      {
        eventId: "e2",
        dimensionKey: "pam_session_minutes",
        quantity: 1,
        occurredAt: new Date("2026-11-05T06:05:00.000Z")
      }
    ]);
    await flushAsync();

    expect(queue).toHaveBeenCalledTimes(1);
    const [name, job, payload, opts] = queue.mock.calls[0] as unknown as [
      QueueName,
      QueueJobs,
      { orgId: string; events: { eventId: string; occurredAt: string; quantity: number }[] },
      Record<string, unknown>
    ];
    expect(name).toBe(QueueName.MeteringEvent);
    expect(job).toBe(QueueJobs.MeteringEvent);
    expect(payload.orgId).toBe(ORG_ID);
    expect(payload.events[0]).toEqual({
      eventId: "e1",
      dimensionKey: "pam_session_minutes",
      quantity: 3,
      occurredAt: "2026-11-05T06:00:00.000Z"
    });
    expect(payload.events[1].occurredAt).toBe("2026-11-05T06:05:00.000Z");
    expect(opts.attempts).toBeGreaterThan(1);
    expect(opts).not.toHaveProperty("deduplication");
    expect(opts).not.toHaveProperty("delay");
  });

  test("splits a large batch into one job per server request", async () => {
    const { svc, queue } = buildService(true);
    svc.recordMeteringEvents(
      ORG_ID,
      Array.from({ length: 2500 }, (_, i) => ({
        eventId: `e${i}`,
        dimensionKey: "secret_syncs",
        quantity: 1,
        occurredAt: AT
      }))
    );
    await flushAsync();

    const sizes = queue.mock.calls.map(
      (call) => (call as unknown as [unknown, unknown, { events: unknown[] }])[2].events.length
    );
    expect(sizes).toEqual([1000, 1000, 500]);
  });

  test("gives each dimension its own jobs, so a refused dimension cannot take another's events", async () => {
    const { svc, queue } = buildService(true);
    svc.recordMeteringEvents(ORG_ID, [
      { eventId: "p1", dimensionKey: "pam_session_minutes", quantity: 42, occurredAt: AT },
      { eventId: "s1", dimensionKey: "secret_syncs", quantity: 1, occurredAt: AT },
      { eventId: "p2", dimensionKey: "pam_session_minutes", quantity: 15, occurredAt: AT }
    ]);
    await flushAsync();

    const jobs = queue.mock.calls.map((call) =>
      (call as unknown as [unknown, unknown, { events: { eventId: string; dimensionKey: string }[] }])[2].events.map(
        (e) => `${e.dimensionKey}:${e.eventId}`
      )
    );
    expect(jobs).toEqual([["pam_session_minutes:p1", "pam_session_minutes:p2"], ["secret_syncs:s1"]]);
  });

  test("never throws into the caller when enqueue fails", async () => {
    const { svc } = buildService(
      true,
      vi.fn(async () => {
        throw new Error("redis down");
      })
    );
    expect(() =>
      svc.recordMeteringEvents(ORG_ID, [{ eventId: "e1", dimensionKey: "secret_syncs", quantity: 1, occurredAt: AT }])
    ).not.toThrow();
    await flushAsync();
  });
});

const makeEvents = (n: number): TUsageEvent[] =>
  Array.from({ length: n }, (_, i) => ({
    event_id: `e${i}`,
    dimension_key: "secret_syncs",
    quantity: 1,
    occurred_at: "2026-11-05T06:00:00.000Z",
    source: "cloud"
  }));

describe("usageReporter.reportEvents", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("posts to the org's usage-events route in chunks of 1000 and returns every result", async () => {
    const fetchMock = vi.fn(async (_url: URL, init: RequestInit) => {
      const { events } = JSON.parse(init.body as string) as { events: TUsageEvent[] };
      return new Response(
        JSON.stringify({ results: events.map((e) => ({ event_id: e.event_id, status: "accepted" })) }),
        { status: 202 }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const reporter = usageReporterFactory(SERVER_URL, async () => "token");
    const results = await reporter.reportEvents(ORG_ID, makeEvents(2500));

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const sizes = fetchMock.mock.calls.map(
      ([, init]) => (JSON.parse(init.body as string) as { events: unknown[] }).events.length
    );
    expect(sizes).toEqual([1000, 1000, 500]);
    expect(String(fetchMock.mock.calls[0][0])).toBe(`${SERVER_URL}/v1/organizations/${ORG_ID}/usage-events`);
    expect((fetchMock.mock.calls[0][1].headers as Record<string, string>).Authorization).toBe("Bearer token");
    expect(results).toHaveLength(2500);
  });

  test("throws a UsageReportError carrying the server status and message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ message: "does not take usage events" }), { status: 422 }))
    );

    const reporter = usageReporterFactory(SERVER_URL, async () => "token");
    const err = await reporter.reportEvents(ORG_ID, makeEvents(1)).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(UsageReportError);
    expect((err as UsageReportError).status).toBe(422);
    expect((err as UsageReportError).serverMessage).toBe("does not take usage events");
  });
});

describe("usageEventQueue.handleMeteringEvents (worker)", () => {
  const jobEvents = [
    { eventId: "e1", dimensionKey: "pam_session_minutes", quantity: 3, occurredAt: "2026-11-05T06:00:00.000Z" }
  ];

  const buildQueue = (
    overrides: { isCloud?: boolean; slug?: string | null; reportEvents?: () => Promise<unknown> } = {}
  ) => {
    const reportEvents = vi.fn(overrides.reportEvents ?? (async () => [{ event_id: "e1", status: "accepted" }]));
    const getPlan = vi.fn(async () => ({ slug: overrides.slug === undefined ? "pro" : overrides.slug }));
    const queue = usageEventQueueFactory({
      queueService: { start: vi.fn() },
      cronJob: { register: vi.fn(), start: vi.fn(), stop: vi.fn() } as never,
      keyStore: { getItem: vi.fn(), setItemWithExpiry: vi.fn() },
      licenseService: { getPlan } as never,
      usageMeteringService: { emit: vi.fn() },
      meteredFeatures: [],
      usageReporter: { reportSnapshots: vi.fn(), reportEvents } as never,
      isCloud: overrides.isCloud ?? true,
      isOffline: false,
      source: "test-region"
    });
    return { queue, reportEvents };
  };

  test("reports the events on the wire shape with the instance source (cloud, per org)", async () => {
    const { queue, reportEvents } = buildQueue();
    await queue.handleMeteringEvents(ORG_ID, jobEvents);
    expect(reportEvents).toHaveBeenCalledWith(ORG_ID, [
      {
        event_id: "e1",
        dimension_key: "pam_session_minutes",
        quantity: 3,
        occurred_at: "2026-11-05T06:00:00.000Z",
        source: "test-region"
      }
    ]);
  });

  test("self-hosted reports at the instance identity, not the triggering org", async () => {
    const { queue, reportEvents } = buildQueue({ isCloud: false, slug: null });
    await queue.handleMeteringEvents(ORG_ID, jobEvents);
    expect(reportEvents).toHaveBeenCalledWith("self-hosted", expect.any(Array));
  });

  test("reports even when the plan reads as free, since an outage serves a slugless fallback plan", async () => {
    const { queue, reportEvents } = buildQueue({ slug: null });
    await queue.handleMeteringEvents(ORG_ID, jobEvents);
    expect(reportEvents).toHaveBeenCalledTimes(1);
  });

  test.each([
    [404, "license not found"],
    [422, "dimension_key secret_syncs does not take usage events"]
  ])("drops a batch the server rejects with %i (%s) instead of retrying", async (status, message) => {
    const { queue } = buildQueue({
      reportEvents: async () => {
        throw new UsageReportError(status, message);
      }
    });
    await expect(queue.handleMeteringEvents(ORG_ID, jobEvents)).resolves.toBeUndefined();
  });

  test.each([
    [404, "not found"],
    [500, "internal server error"]
  ])("rethrows %i (%s) so the job retries", async (status, message) => {
    const { queue } = buildQueue({
      reportEvents: async () => {
        throw new UsageReportError(status, message);
      }
    });
    await expect(queue.handleMeteringEvents(ORG_ID, jobEvents)).rejects.toBeInstanceOf(UsageReportError);
  });
});
