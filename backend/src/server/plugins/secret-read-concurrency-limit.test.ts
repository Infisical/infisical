import Fastify from "fastify";
import { afterEach, describe, expect, test, vi } from "vitest";

import { ServerBusyError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import {
  recordSecretRateLimitExceededMetric,
  recordSecretReadSizeMetric,
  registerSecretReadBudgetGauges
} from "@app/lib/telemetry/metrics";

import { secretReadConcurrencyLimit } from "./secret-read-concurrency-limit";

const config = vi.hoisted(() => ({
  SECRET_READ_CONCURRENCY_LIMIT_MODE: "enforce" as "off" | "observe" | "enforce",
  SECRET_READ_HEAP_BASELINE_BYTES: 2000,
  SECRET_READ_HEAP_RESERVE_BYTES: 3000,
  SECRET_READ_PEAK_BYTES_PER_SECRET: 10,
  SECRET_READ_DEFAULT_SECRET_WEIGHT: 100
}));

const heap = vi.hoisted(() => ({ limit: 0 }));

vi.mock("node:v8", () => ({
  default: { getHeapStatistics: () => ({ heap_size_limit: heap.limit }) }
}));

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => config
}));

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

vi.mock("@app/lib/telemetry/metrics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/lib/telemetry/metrics")>()),
  recordSecretRateLimitExceededMetric: vi.fn(),
  recordSecretReadSizeMetric: vi.fn(),
  registerSecretReadBudgetGauges: vi.fn()
}));

const defaults = { ...config };

const heapLimitForBudget = (secrets: number) =>
  config.SECRET_READ_HEAP_BASELINE_BYTES +
  config.SECRET_READ_HEAP_RESERVE_BYTES +
  secrets * config.SECRET_READ_PEAK_BYTES_PER_SECRET;

type THeldRead = { finish: () => void; fail: () => void; reportSize: (secretCount: number) => void };

const buildServer = async ({ budget = 10_000 }: { budget?: number } = {}) => {
  heap.limit = heapLimitForBudget(budget);
  const app = Fastify({ logger: false });
  const held: THeldRead[] = [];

  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof ServerBusyError) return reply.status(503).send({ message: error.message });
    return reply.status(500).send({ message: String(error) });
  });

  app.addHook("onRequest", async (req) => {
    const rootOrgId = req.headers["x-org-id"] as string | undefined;
    Object.assign(req, {
      auth: rootOrgId ? { orgId: rootOrgId, rootOrgId } : undefined,
      rateLimitPlanSlug: "pro"
    });
  });

  await app.register(secretReadConcurrencyLimit);

  const holdUntilReleased = async (reportSize: (secretCount: number) => void = () => {}) => {
    await new Promise<void>((resolve, reject) => {
      held.push({ finish: resolve, fail: () => reject(new Error("read failed")), reportSize });
    });
    return { ok: true };
  };

  app.get("/secrets", async (req, reply) => {
    if (req.headers["x-not-modified"]) return { ok: true };
    const sizeKey = req.headers["x-size-key"] as string | undefined;
    return app.secretReadSlot(req, reply)(holdUntilReleased, sizeKey ? { sizeKey } : undefined);
  });
  app.get("/folders", () => holdUntilReleased());

  await app.ready();

  const list = (orgId: string, sizeKey?: string) =>
    app.inject({
      method: "GET",
      url: "/secrets",
      headers: { "x-org-id": orgId, ...(sizeKey ? { "x-size-key": sizeKey } : {}) }
    });

  const [gauges] = vi.mocked(registerSecretReadBudgetGauges).mock.calls.at(-1) ?? [];

  return { app, held, list, gauges };
};

const flush = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 20);
  });

describe("secretReadConcurrencyLimit", () => {
  afterEach(() => {
    Object.assign(config, defaults);
    vi.mocked(recordSecretRateLimitExceededMetric).mockClear();
    vi.mocked(recordSecretReadSizeMetric).mockClear();
    vi.mocked(registerSecretReadBudgetGauges).mockClear();
    vi.mocked(logger.warn).mockClear();
  });

  test("sizes the instance budget from the heap limit and registers its gauges", async () => {
    const { gauges } = await buildServer({ budget: 1234 });

    expect(gauges?.getCapacity()).toBe(1234);
    expect(gauges?.getUsed()).toBe(0);
  });

  test("refuses to start when the heap limit leaves no room for the budget", async () => {
    heap.limit = config.SECRET_READ_HEAP_BASELINE_BYTES + config.SECRET_READ_HEAP_RESERVE_BYTES;
    const app = Fastify({ logger: false });

    await expect(app.register(secretReadConcurrencyLimit).ready()).rejects.toThrow(
      /leaves no room for secret list requests/
    );
  });

  test("answers a 503 at once when the instance has no room, and admits again once room frees up", async () => {
    const { held, list } = await buildServer({ budget: 150 });

    const first = list("org-a");
    await flush();
    const refused = await list("org-b");

    expect(refused.statusCode).toBe(503);
    expect(refused.headers["retry-after"]).toBe("1");
    expect(refused.json<{ message: string }>().message).toContain(
      "Infisical is handling too many secret list requests right now"
    );
    expect(vi.mocked(recordSecretRateLimitExceededMetric).mock.calls).toEqual([
      [{ bucket: "read_budget", outcome: "refused", planSlug: "pro" }]
    ]);

    held[0].finish();
    expect((await first).statusCode).toBe(200);

    const next = list("org-b");
    await flush();
    expect(held).toHaveLength(2);
    held[1].finish();
    expect((await next).statusCode).toBe(200);
  });

  test("runs several requests from one organization together while they fit", async () => {
    const { held, list, gauges } = await buildServer({ budget: 300 });

    const requests = [list("org-a"), list("org-a"), list("org-a")];
    await flush();

    expect(held).toHaveLength(3);
    expect(gauges?.getUsed()).toBe(300);
    expect((await list("org-a")).statusCode).toBe(503);

    held.forEach((request) => request.finish());
    expect((await Promise.all(requests)).map((res) => res.statusCode)).toEqual([200, 200, 200]);
    expect(gauges?.getUsed()).toBe(0);
  });

  test("answers a request that needs no slot while the instance has no room", async () => {
    const { app, held, list } = await buildServer({ budget: 150 });

    const first = list("org-a");
    await flush();
    const notModified = await app.inject({
      method: "GET",
      url: "/secrets",
      headers: { "x-org-id": "org-b", "x-not-modified": "1" }
    });

    expect(notModified.statusCode).toBe(200);
    expect(held).toHaveLength(1);
    held[0].finish();
    expect((await first).statusCode).toBe(200);
  });

  test("holds the size a read reports instead of its estimate", async () => {
    const { held, list, gauges } = await buildServer({ budget: 1000 });

    const large = list("org-a");
    await flush();
    held[0].reportSize(950);
    expect(gauges?.getUsed()).toBe(950);
    expect((await list("org-b")).statusCode).toBe(503);

    held[0].reportSize(200);
    const other = list("org-b");
    await flush();
    expect(held).toHaveLength(2);

    held.forEach((request) => request.finish());
    expect((await large).statusCode).toBe(200);
    expect((await other).statusCode).toBe(200);
  });

  test("lets a running read grow past the budget without failing it", async () => {
    const { held, list, gauges } = await buildServer({ budget: 150 });

    const growing = list("org-a");
    await flush();
    held[0].reportSize(950);

    expect(gauges?.getUsed()).toBe(950);
    expect((await list("org-b")).statusCode).toBe(503);

    held[0].finish();
    expect((await growing).statusCode).toBe(200);
    expect(gauges?.getUsed()).toBe(0);
  });

  test("admits a read it has seen before on the size it had last time", async () => {
    const { held, list } = await buildServer({ budget: 1000 });

    const firstRun = list("org-a", "project-1:hash");
    await flush();
    held[0].reportSize(950);
    held[0].finish();
    expect((await firstRun).statusCode).toBe(200);

    const secondRun = list("org-a", "project-1:hash");
    await flush();
    expect((await list("org-b")).statusCode).toBe(503);

    held[1].finish();
    expect((await secondRun).statusCode).toBe(200);
    expect(vi.mocked(recordSecretReadSizeMetric).mock.calls).toEqual([
      [{ secretCount: 950, estimate: 100, estimateSource: "default", planSlug: "pro" }]
    ]);
  });

  test("runs a read larger than the whole budget when the instance is empty, and nothing beside it", async () => {
    const { held, list } = await buildServer({ budget: 150 });

    const firstRun = list("org-a", "project-1:hash");
    await flush();
    held[0].reportSize(950);
    held[0].finish();
    await firstRun;

    const small = list("org-b");
    await flush();
    expect((await list("org-a", "project-1:hash")).statusCode).toBe(503);
    held[1].finish();
    await small;

    const secondRun = list("org-a", "project-1:hash");
    await flush();
    expect(held).toHaveLength(3);
    expect((await list("org-b")).statusCode).toBe(503);

    held[2].finish();
    expect((await secondRun).statusCode).toBe(200);
  });

  test("records a read's size once, from its last report, and whether its estimate was remembered", async () => {
    const { held, list } = await buildServer();

    const firstRun = list("org-a", "project-1:hash");
    await flush();
    held[0].reportSize(10);
    held[0].reportSize(30);
    held[0].finish();
    await firstRun;

    const secondRun = list("org-b", "project-1:hash");
    await flush();
    held[1].reportSize(45);
    held[1].fail();
    expect((await secondRun).statusCode).toBe(500);

    expect(vi.mocked(recordSecretReadSizeMetric).mock.calls).toEqual([
      [{ secretCount: 30, estimate: 100, estimateSource: "default", planSlug: "pro" }],
      [{ secretCount: 45, estimate: 30, estimateSource: "last_known", planSlug: "pro" }]
    ]);
  });

  test("frees the room when the request fails, and ignores a size reported after it ended", async () => {
    const { held, list, gauges } = await buildServer({ budget: 150 });

    const failing = list("org-a");
    await flush();
    held[0].fail();
    expect((await failing).statusCode).toBe(500);
    held[0].reportSize(950);
    expect(gauges?.getUsed()).toBe(0);

    const next = list("org-a");
    await flush();
    held[1].finish();
    expect((await next).statusCode).toBe(200);
  });

  test("lets every request through in observe mode and reports the ones enforce mode would refuse", async () => {
    config.SECRET_READ_CONCURRENCY_LIMIT_MODE = "observe";
    const { held, list } = await buildServer({ budget: 150 });

    const requests = [list("org-a"), list("org-b"), list("org-c")];
    await flush();

    expect(held).toHaveLength(3);
    expect(vi.mocked(recordSecretRateLimitExceededMetric).mock.calls).toEqual([
      [{ bucket: "read_budget", outcome: "would_refuse", planSlug: "pro" }],
      [{ bucket: "read_budget", outcome: "would_refuse", planSlug: "pro" }]
    ]);

    held.forEach((request) => request.finish());
    const responses = await Promise.all(requests);
    expect(responses.map((res) => res.statusCode)).toEqual([200, 200, 200]);
    expect(responses.map((res) => res.headers["retry-after"])).toEqual([undefined, undefined, undefined]);
  });

  test("counts the secrets requests really hold in observe mode, past the budget", async () => {
    config.SECRET_READ_CONCURRENCY_LIMIT_MODE = "observe";
    const { held, list, gauges } = await buildServer({ budget: 150 });

    const requests = [list("org-a", "project-1:hash"), list("org-b")];
    await flush();
    held[0].reportSize(950);

    expect(gauges?.getCapacity()).toBe(150);
    expect(gauges?.getUsed()).toBe(1050);

    held.forEach((request) => request.finish());
    expect((await Promise.all(requests)).map((res) => res.statusCode)).toEqual([200, 200]);
    expect(gauges?.getUsed()).toBe(0);
    expect(vi.mocked(recordSecretReadSizeMetric).mock.calls).toEqual([
      [{ secretCount: 950, estimate: 100, estimateSource: "default", planSlug: "pro" }]
    ]);
  });

  test("starts in observe mode when the heap limit leaves no room, and reports every request", async () => {
    config.SECRET_READ_CONCURRENCY_LIMIT_MODE = "observe";
    const { held, list, gauges } = await buildServer({ budget: 0 });

    const only = list("org-a");
    await flush();

    expect(held).toHaveLength(1);
    expect(gauges?.getCapacity()).toBe(0);
    expect(vi.mocked(logger.warn).mock.calls[0][0]).toContain("leaves no room for secret list requests");
    expect(vi.mocked(recordSecretRateLimitExceededMetric).mock.calls).toEqual([
      [{ bucket: "read_budget", outcome: "would_refuse", planSlug: "pro" }]
    ]);

    held[0].finish();
    expect((await only).statusCode).toBe(200);
  });

  test("leaves routes that take no slot and a disabled limit alone", async () => {
    const { app, held } = await buildServer({ budget: 150 });
    const unflagged = [0, 1].map(() =>
      app.inject({ method: "GET", url: "/folders", headers: { "x-org-id": "org-a" } })
    );
    await flush();
    expect(held).toHaveLength(2);
    held.forEach((request) => request.finish());
    expect((await Promise.all(unflagged)).map((res) => res.statusCode)).toEqual([200, 200]);

    config.SECRET_READ_CONCURRENCY_LIMIT_MODE = "off";
    const disabled = await buildServer({ budget: 0 });
    const requests = [0, 1].map(() => disabled.list("org-a"));
    await flush();
    expect(disabled.held).toHaveLength(2);
    disabled.held.forEach((request) => request.finish());
    expect((await Promise.all(requests)).map((res) => res.statusCode)).toEqual([200, 200]);
    expect(vi.mocked(registerSecretReadBudgetGauges)).toHaveBeenCalledTimes(1);
  });
});
