import ratelimiter from "@fastify/rate-limit";
import Fastify, { FastifyInstance } from "fastify";
import { afterEach, describe, expect, test, vi } from "vitest";

import { RateLimitError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import {
  recordSecretOrgBudgetExceededMetric,
  recordSecretOrgBudgetUsageMetric,
  recordSecretRateLimitExceededMetric
} from "@app/lib/telemetry/metrics";
import { DEFAULT_RATE_LIMITS, secretsLimit } from "@app/server/config/rateLimiter";

import { countReturnedSecrets, secretsOrgBudget, secretsOrgBudgetCost } from "./secrets-org-budget";

const BUDGET = 3;

const config = vi.hoisted(() => ({ SECRET_READ_ORG_BUDGET_MODE: "enforce", SECRET_READ_ORG_BUDGET: 3 }));

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => config
}));

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

vi.mock("@app/lib/telemetry/metrics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/lib/telemetry/metrics")>()),
  recordSecretRateLimitExceededMetric: vi.fn(),
  recordSecretOrgBudgetUsageMetric: vi.fn(),
  recordSecretOrgBudgetExceededMetric: vi.fn()
}));

const createKeyStore = () => {
  const counters = new Map<string, { value: number; expiresAt: number }>();
  let now = 0;
  let isFailing = false;

  const read = (key: string) => {
    if (isFailing) throw new Error("key store unavailable");
    const counter = counters.get(key);
    if (counter && counter.expiresAt <= now) {
      counters.delete(key);
      return undefined;
    }
    return counter;
  };

  return {
    advanceSeconds: (seconds: number) => {
      now += seconds;
    },
    startFailing: () => {
      isFailing = true;
    },
    getItemPrimary: vi.fn(async (key: string) => {
      const counter = read(key);
      return counter ? String(counter.value) : null;
    }),
    ttl: vi.fn(async (key: string) => {
      const counter = read(key);
      return counter ? counter.expiresAt - now : -2;
    }),
    incrementByWithFixedExpiry: vi.fn(async (key: string, value: number, expiryInSeconds: number) => {
      const counter = read(key) ?? { value: 0, expiresAt: now + expiryInSeconds };
      counter.value += value;
      counters.set(key, counter);
      return counter.value;
    })
  };
};

const buildServer = async ({ withRateLimiter = true }: { withRateLimiter?: boolean } = {}) => {
  const app = Fastify({ logger: false });
  const keyStore = createKeyStore();

  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof RateLimitError) return reply.status(429).send({ message: error.message });
    return reply.status(500).send({ message: String(error) });
  });

  if (withRateLimiter) {
    await app.register(ratelimiter, { timeWindow: 60 * 1000, max: 600, keyGenerator: (req) => req.realIp });
  }

  app.addHook("onRequest", async (req) => {
    const rootOrgId = req.headers["x-org-id"] as string | undefined;
    Object.assign(req, {
      realIp: "10.0.0.1",
      auth: rootOrgId ? { orgId: req.headers["x-sub-org-id"] ?? rootOrgId, rootOrgId } : undefined,
      rateLimits: { ...DEFAULT_RATE_LIMITS, secretsLimit: 1000 },
      rateLimitPlanSlug: "pro"
    });
  });

  await app.register(secretsOrgBudget, { keyStore });

  app.get("/secrets", { config: { rateLimit: secretsLimit } }, async (req, reply) => {
    const orgBudget = app.secretsOrgBudget(req, reply);
    await orgBudget.check();
    orgBudget.charge(Number(req.headers["x-secret-count"] ?? 1));
    return { ok: true };
  });

  app.get("/not-modified", { config: { rateLimit: secretsLimit } }, async (req, reply) => {
    app.secretsOrgBudget(req, reply);
    return { ok: true };
  });

  await app.ready();
  return { app, keyStore };
};

const read = (app: FastifyInstance, secretCount: number, headers: Record<string, string> = { "x-org-id": "org-a" }) =>
  app.inject({ method: "GET", url: "/secrets", headers: { ...headers, "x-secret-count": String(secretCount) } });

const statusesOf = async (count: number, send: () => ReturnType<typeof read>) => {
  const statuses: number[] = [];
  for (let i = 0; i < count; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    statuses.push((await send()).statusCode);
  }
  return statuses;
};

const allOk = (count: number) => Array.from({ length: count }, () => 200);

describe("secrets org budget cost", () => {
  test.each([
    [0, 0],
    [1, 1],
    [20, 1],
    [100, 1],
    [101, 2],
    [1000, 10],
    [10_000, 100]
  ])("%i secrets cost %i credits", (secretCount, cost) => {
    expect(secretsOrgBudgetCost(secretCount)).toBe(cost);
  });

  test("counts the secrets of every import along with the folder's own", () => {
    expect(countReturnedSecrets({ secrets: [1, 2], imports: [{ secrets: [3] }, { secrets: [4, 5, 6] }] })).toBe(6);
    expect(countReturnedSecrets({ secrets: [1, 2] })).toBe(2);
  });
});

describe("secrets org budget", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
    Object.assign(config, { SECRET_READ_ORG_BUDGET_MODE: "enforce", SECRET_READ_ORG_BUDGET: BUDGET });
    vi.mocked(recordSecretRateLimitExceededMetric).mockClear();
    vi.mocked(recordSecretOrgBudgetUsageMetric).mockClear();
    vi.mocked(recordSecretOrgBudgetExceededMetric).mockClear();
    vi.mocked(logger.warn).mockClear();
    vi.mocked(logger.info).mockClear();
  });

  test("refuses an organization's reads once its budget is spent", async () => {
    const built = await buildServer();
    app = built.app;
    const server = built.app;

    expect(await statusesOf(BUDGET, () => read(server, 100))).toEqual(allOk(BUDGET));

    const refused = await read(server, 1);
    expect(refused.statusCode).toBe(429);
    expect(refused.json<{ message: string }>().message).toBe(
      "Your organization read more secrets in the last minute than its limit allows. Please try again in 60 seconds"
    );
    expect(refused.headers["retry-after"]).toBe("60");
    expect(vi.mocked(recordSecretRateLimitExceededMetric).mock.calls).toEqual([
      [{ bucket: "org_budget", outcome: "refused", planSlug: "pro" }]
    ]);
  });

  test("refuses nothing until the route checks the budget", async () => {
    const built = await buildServer();
    app = built.app;

    await read(built.app, 10_000);
    built.keyStore.getItemPrimary.mockClear();

    const notModified = await built.app.inject({
      method: "GET",
      url: "/not-modified",
      headers: { "x-org-id": "org-a" }
    });
    expect(notModified.statusCode).toBe(200);
    expect(built.keyStore.getItemPrimary).not.toHaveBeenCalled();
  });

  test("lets one read larger than the whole budget through and refuses the next", async () => {
    const built = await buildServer();
    app = built.app;

    expect((await read(built.app, 10_000)).statusCode).toBe(200);
    expect((await read(built.app, 1)).statusCode).toBe(429);
  });

  test("charges nothing for a read that returns no secrets", async () => {
    const built = await buildServer();
    app = built.app;
    const server = built.app;

    expect(await statusesOf(BUDGET + 2, () => read(server, 0))).toEqual(allOk(BUDGET + 2));
    expect(built.keyStore.incrementByWithFixedExpiry).not.toHaveBeenCalled();
  });

  test("does not charge a read it refused", async () => {
    const built = await buildServer();
    app = built.app;

    await read(built.app, 300);
    await read(built.app, 300);

    expect(built.keyStore.incrementByWithFixedExpiry).toHaveBeenCalledTimes(1);
  });

  test("opens a new budget when the window ends, counted from the first charge", async () => {
    const built = await buildServer();
    app = built.app;

    await read(built.app, 200);
    built.keyStore.advanceSeconds(40);
    await read(built.app, 100);
    expect((await read(built.app, 1)).headers["retry-after"]).toBe("20");

    built.keyStore.advanceSeconds(20);
    expect((await read(built.app, 1)).statusCode).toBe(200);
  });

  test("keeps a budget per root organization, shared by its sub-organizations", async () => {
    const built = await buildServer();
    app = built.app;

    await read(built.app, 200, { "x-org-id": "org-a", "x-sub-org-id": "sub-1" });
    await read(built.app, 100, { "x-org-id": "org-a", "x-sub-org-id": "sub-2" });

    expect((await read(built.app, 1, { "x-org-id": "org-a", "x-sub-org-id": "sub-3" })).statusCode).toBe(429);
    expect((await read(built.app, 1, { "x-org-id": "org-b" })).statusCode).toBe(200);
  });

  test("records the credits spent in the window after each charge", async () => {
    const built = await buildServer();
    app = built.app;

    await read(built.app, 150);
    await read(built.app, 20);

    expect(vi.mocked(recordSecretOrgBudgetUsageMetric).mock.calls).toEqual([
      [{ usedCredits: 2, planSlug: "pro" }],
      [{ usedCredits: 3, planSlug: "pro" }]
    ]);
  });

  test("records how far the read that spends the last of the budget went past it, and logs the organization", async () => {
    const built = await buildServer();
    app = built.app;

    await read(built.app, 200);
    expect(recordSecretOrgBudgetExceededMetric).not.toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalled();

    await read(built.app, 500);
    expect(vi.mocked(recordSecretOrgBudgetExceededMetric).mock.calls).toEqual([
      [{ exceededCredits: 4, planSlug: "pro" }]
    ]);
    expect(vi.mocked(logger.info).mock.calls).toEqual([
      [expect.stringContaining("[orgId=org-a] [cost=5] [used=7] [budget=3] [exceeded=4]")]
    ]);
  });

  test("records 0 credits exceeded for a read that lands exactly on the budget", async () => {
    const built = await buildServer();
    app = built.app;
    const server = built.app;

    await statusesOf(BUDGET, () => read(server, 100));

    expect(vi.mocked(recordSecretOrgBudgetExceededMetric).mock.calls).toEqual([
      [{ exceededCredits: 0, planSlug: "pro" }]
    ]);
  });

  test("records the credits exceeded once per window, however many reads follow it", async () => {
    config.SECRET_READ_ORG_BUDGET_MODE = "observe";
    const built = await buildServer();
    app = built.app;
    const server = built.app;

    await statusesOf(BUDGET + 2, () => read(server, 100));
    expect(recordSecretOrgBudgetExceededMetric).toHaveBeenCalledTimes(1);

    built.keyStore.advanceSeconds(60);
    await read(server, 10_000);

    expect(vi.mocked(recordSecretOrgBudgetExceededMetric).mock.calls).toEqual([
      [{ exceededCredits: 0, planSlug: "pro" }],
      [{ exceededCredits: 97, planSlug: "pro" }]
    ]);
  });

  test("only reports what it would refuse while observing, and keeps charging", async () => {
    config.SECRET_READ_ORG_BUDGET_MODE = "observe";
    const built = await buildServer();
    app = built.app;
    const server = built.app;

    expect(await statusesOf(BUDGET + 2, () => read(server, 100))).toEqual(allOk(BUDGET + 2));

    expect(vi.mocked(recordSecretRateLimitExceededMetric).mock.calls).toEqual([
      [{ bucket: "org_budget", outcome: "would_refuse", planSlug: "pro" }],
      [{ bucket: "org_budget", outcome: "would_refuse", planSlug: "pro" }]
    ]);
    expect(vi.mocked(recordSecretOrgBudgetUsageMetric).mock.calls.at(-1)).toEqual([
      { usedCredits: BUDGET + 2, planSlug: "pro" }
    ]);
  });

  test("allows reads when the key store cannot be reached", async () => {
    const built = await buildServer();
    app = built.app;
    const server = built.app;
    built.keyStore.startFailing();

    expect(await statusesOf(BUDGET + 2, () => read(server, 100))).toEqual(allOk(BUDGET + 2));
    expect(logger.warn).toHaveBeenCalled();
    expect(recordSecretRateLimitExceededMetric).not.toHaveBeenCalled();
  });

  test("leaves a request without an organization alone", async () => {
    const built = await buildServer();
    app = built.app;
    const server = built.app;

    expect(await statusesOf(BUDGET + 2, () => read(server, 100, {}))).toEqual(allOk(BUDGET + 2));
    expect(built.keyStore.getItemPrimary).not.toHaveBeenCalled();
  });

  test.each([
    ["SECRET_READ_ORG_BUDGET_MODE is off", "off", true],
    ["the rate limit plugin is not registered", "enforce", false]
  ])("does nothing when %s", async (_name, mode, withRateLimiter) => {
    config.SECRET_READ_ORG_BUDGET_MODE = mode;
    const built = await buildServer({ withRateLimiter });
    app = built.app;
    const server = built.app;

    expect(await statusesOf(BUDGET + 2, () => read(server, 100))).toEqual(allOk(BUDGET + 2));
    expect(built.keyStore.getItemPrimary).not.toHaveBeenCalled();
    expect(built.keyStore.incrementByWithFixedExpiry).not.toHaveBeenCalled();
  });
});
