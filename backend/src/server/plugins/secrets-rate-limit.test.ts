import ratelimiter from "@fastify/rate-limit";
import Fastify, { FastifyInstance } from "fastify";
import { afterEach, describe, expect, test, vi } from "vitest";

import { RateLimitError } from "@app/lib/errors";
import { DEFAULT_RATE_LIMITS, readLimit, secretsLimit } from "@app/server/config/rateLimiter";
import { ActorType } from "@app/services/auth/auth-type";

import { secretsRateLimit } from "./secrets-rate-limit";

const config = vi.hoisted(() => ({ SECRETS_RATE_LIMIT_ENABLED: true }));

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => config
}));

const IP_LIMIT = 1;
const ORG_LIMIT = 3;
const ACTOR_LIMIT = 2;

const buildServer = async ({ withRateLimiter = true }: { withRateLimiter?: boolean } = {}) => {
  const app = Fastify({ logger: false });

  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof RateLimitError) return reply.status(429).send({ message: error.message });
    return reply.status(500).send({ message: String(error) });
  });

  if (withRateLimiter) {
    await app.register(ratelimiter, {
      timeWindow: 60 * 1000,
      max: 600,
      keyGenerator: (req) => req.realIp,
      errorResponseBuilder: () => {
        throw new RateLimitError({ message: "ip limit" });
      }
    });
  }

  app.addHook("onRequest", async (req) => {
    const orgId = req.headers["x-org-id"] as string | undefined;
    Object.assign(req, {
      realIp: req.headers["x-ip"] ?? "10.0.0.1",
      auth: orgId ? { orgId, rootOrgId: orgId } : undefined,
      permission: {
        type: req.headers["x-actor-type"] ?? ActorType.IDENTITY,
        id: req.headers["x-actor-id"] ?? `actor-of-${String(req.headers["x-ip"])}`
      },
      rateLimits: {
        ...DEFAULT_RATE_LIMITS,
        secretsLimit: IP_LIMIT,
        secretsOrgLimit: ORG_LIMIT,
        secretsActorLimit: ACTOR_LIMIT
      }
    });
  });

  await app.register(secretsRateLimit);

  app.get("/secrets", { config: { rateLimit: secretsLimit } }, async () => ({ ok: true }));
  app.get("/secret-imports", { config: { rateLimit: secretsLimit } }, async () => ({ ok: true }));
  app.get("/projects", { config: { rateLimit: readLimit } }, async () => ({ ok: true }));

  await app.ready();
  return app;
};

const get = (app: FastifyInstance, url: string, headers: Record<string, string>) =>
  app.inject({ method: "GET", url, headers });

const statusesOf = async (count: number, send: (i: number) => ReturnType<typeof get>) => {
  const statuses: number[] = [];
  for (let i = 0; i < count; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    statuses.push((await send(i)).statusCode);
  }
  return statuses;
};

const allOk = (count: number) => Array.from({ length: count }, () => 200);

describe("secrets org rate limit", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
    config.SECRETS_RATE_LIMIT_ENABLED = true;
  });

  test("refuses an organization past its limit even when each request comes from a different IP", async () => {
    app = await buildServer();
    const server = app;

    expect(
      await statusesOf(ORG_LIMIT, (i) => get(server, "/secrets", { "x-org-id": "org-a", "x-ip": `ip-${i}` }))
    ).toEqual(allOk(ORG_LIMIT));

    const refused = await get(server, "/secrets", { "x-org-id": "org-a", "x-ip": "ip-last" });
    expect(refused.statusCode).toBe(429);
    expect(refused.json<{ message: string }>().message).toMatch(
      new RegExp(`^Your organization has made more than ${ORG_LIMIT} secret requests in the last minute`)
    );
    expect(Number(refused.headers["retry-after"])).toBeGreaterThan(0);
  });

  test("shares one count across every secret route of the organization", async () => {
    app = await buildServer();
    const server = app;

    expect(
      await statusesOf(ORG_LIMIT, (i) =>
        get(server, i % 2 ? "/secrets" : "/secret-imports", { "x-org-id": "org-a", "x-ip": `ip-${i}` })
      )
    ).toEqual(allOk(ORG_LIMIT));
    expect((await get(server, "/secrets", { "x-org-id": "org-a", "x-ip": "ip-last" })).statusCode).toBe(429);
  });

  test("counts each organization separately", async () => {
    app = await buildServer();
    const server = app;

    await statusesOf(ORG_LIMIT, (i) => get(server, "/secrets", { "x-org-id": "org-a", "x-ip": `ip-${i}` }));
    expect((await get(server, "/secrets", { "x-org-id": "org-a", "x-ip": "ip-last" })).statusCode).toBe(429);
    expect((await get(server, "/secrets", { "x-org-id": "org-b", "x-ip": "ip-org-b" })).statusCode).toBe(200);
  });

  test("does not count requests the per-IP limit already refused", async () => {
    app = await buildServer();
    const server = app;

    expect(await statusesOf(3, () => get(server, "/secrets", { "x-org-id": "org-a", "x-ip": "ip-shared" }))).toEqual([
      200, 429, 429
    ]);

    expect(
      await statusesOf(ORG_LIMIT - 1, (i) => get(server, "/secrets", { "x-org-id": "org-a", "x-ip": `ip-${i}` }))
    ).toEqual(allOk(ORG_LIMIT - 1));
    expect((await get(server, "/secrets", { "x-org-id": "org-a", "x-ip": "ip-last" })).statusCode).toBe(429);
  });

  test("leaves routes outside the secrets limit and requests without an organization alone", async () => {
    app = await buildServer();
    const server = app;

    await statusesOf(ORG_LIMIT, (i) => get(server, "/projects", { "x-org-id": "org-a", "x-ip": `ip-${i}` }));
    expect(
      await statusesOf(ORG_LIMIT, (i) => get(server, "/secrets", { "x-org-id": "org-a", "x-ip": `ip-${i}` }))
    ).toEqual(allOk(ORG_LIMIT));
    expect(await statusesOf(ORG_LIMIT + 1, (i) => get(server, "/secret-imports", { "x-ip": `ip-${i}` }))).toEqual(
      allOk(ORG_LIMIT + 1)
    );
  });

  test("does nothing when the rate limit plugin is not registered", async () => {
    app = await buildServer({ withRateLimiter: false });
    const server = app;

    expect(
      await statusesOf(ORG_LIMIT + 1, (i) => get(server, "/secrets", { "x-org-id": "org-a", "x-ip": `ip-${i}` }))
    ).toEqual(allOk(ORG_LIMIT + 1));
  });

  test("does nothing when SECRETS_RATE_LIMIT_ENABLED is off", async () => {
    config.SECRETS_RATE_LIMIT_ENABLED = false;
    app = await buildServer();
    const server = app;

    expect(
      await statusesOf(ORG_LIMIT + 1, (i) =>
        get(server, "/secrets", { "x-org-id": "org-a", "x-ip": `ip-${i}`, "x-actor-id": "actor-1" })
      )
    ).toEqual(allOk(ORG_LIMIT + 1));
  });
});

describe("secrets actor rate limit", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  const asActor = (i: number, actorId: string, extra: Record<string, string> = {}) => ({
    "x-org-id": "org-a",
    "x-ip": `ip-${actorId}-${i}`,
    "x-actor-id": actorId,
    ...extra
  });

  test("refuses an actor past its limit even when each request comes from a different IP", async () => {
    app = await buildServer();
    const server = app;

    expect(await statusesOf(ACTOR_LIMIT, (i) => get(server, "/secrets", asActor(i, "actor-1")))).toEqual(
      allOk(ACTOR_LIMIT)
    );

    const refused = await get(server, "/secret-imports", asActor(99, "actor-1"));
    expect(refused.statusCode).toBe(429);
    expect(refused.json<{ message: string }>().message).toMatch(
      new RegExp(`^This machine identity has made more than ${ACTOR_LIMIT} secret requests in the last minute`)
    );
    expect(Number(refused.headers["retry-after"])).toBeGreaterThan(0);

    expect((await get(server, "/secrets", asActor(0, "actor-2"))).statusCode).toBe(200);
  });

  test.each([
    [ActorType.USER, "You have made more than"],
    [ActorType.SERVICE, "This service token has made more than"]
  ])("names a %s actor in the message", async (actorType, expected) => {
    app = await buildServer();
    const server = app;
    const headers = (i: number) => asActor(i, "actor-1", { "x-actor-type": actorType });

    await statusesOf(ACTOR_LIMIT, (i) => get(server, "/secrets", headers(i)));
    const refused = await get(server, "/secrets", headers(99));

    expect(refused.statusCode).toBe(429);
    expect(refused.json<{ message: string }>().message.startsWith(expected)).toBe(true);
  });

  test("counts the same actor ID separately per organization and per actor type", async () => {
    app = await buildServer();
    const server = app;

    await statusesOf(ACTOR_LIMIT, (i) => get(server, "/secrets", asActor(i, "actor-1")));
    expect((await get(server, "/secrets", asActor(99, "actor-1"))).statusCode).toBe(429);

    expect((await get(server, "/secrets", asActor(50, "actor-1", { "x-org-id": "org-b" }))).statusCode).toBe(200);
    expect((await get(server, "/secrets", asActor(51, "actor-1", { "x-actor-type": ActorType.USER }))).statusCode).toBe(
      200
    );
  });

  test("does not count requests the actor limit refused toward the organization limit", async () => {
    app = await buildServer();
    const server = app;

    expect(await statusesOf(ACTOR_LIMIT + 3, (i) => get(server, "/secrets", asActor(i, "actor-1")))).toEqual([
      ...allOk(ACTOR_LIMIT),
      429,
      429,
      429
    ]);

    expect(await statusesOf(ORG_LIMIT - ACTOR_LIMIT, (i) => get(server, "/secrets", asActor(i, `other-${i}`)))).toEqual(
      allOk(ORG_LIMIT - ACTOR_LIMIT)
    );
    const refused = await get(server, "/secrets", asActor(0, "actor-last"));
    expect(refused.statusCode).toBe(429);
    expect(refused.json<{ message: string }>().message.startsWith("Your organization has")).toBe(true);
  });
});
