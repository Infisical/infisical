import Fastify from "fastify";
import { afterEach, describe, expect, test, vi } from "vitest";

import { RateLimitError } from "@app/lib/errors";

import { secretReadConcurrencyLimit } from "./secret-read-concurrency-limit";

const config = vi.hoisted(() => ({
  SECRET_READ_CONCURRENCY_LIMIT_ENABLED: true,
  SECRET_READ_MAX_IN_FLIGHT_PER_ORG: 1,
  SECRET_READ_MAX_IN_FLIGHT: 8,
  SECRET_READ_MAX_QUEUE_WAIT_MS: 5000,
  SECRET_READ_MAX_QUEUE_DEPTH: 0
}));

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => config
}));

const defaults = { ...config };

const buildServer = async () => {
  const app = Fastify({ logger: false });
  const held: Array<{ finish: () => void; fail: () => void }> = [];

  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof RateLimitError) return reply.status(429).send({ message: error.message });
    return reply.status(500).send({ message: String(error) });
  });

  app.addHook("onRequest", async (req) => {
    const orgId = req.headers["x-org-id"] as string | undefined;
    Object.assign(req, { auth: orgId ? { orgId, rootOrgId: orgId } : undefined });
  });

  await app.register(secretReadConcurrencyLimit);

  const holdUntilReleased = async () => {
    await new Promise<void>((resolve, reject) => {
      held.push({ finish: resolve, fail: () => reject(new Error("read failed")) });
    });
    return { ok: true };
  };

  app.get("/secrets", { config: { limitSecretReadConcurrency: true } }, holdUntilReleased);
  app.get("/folders", holdUntilReleased);

  await app.ready();
  return { app, held };
};

const flush = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 20);
  });

describe("secretReadConcurrencyLimit", () => {
  afterEach(() => {
    Object.assign(config, defaults);
  });

  test("refuses a second list request from an organization while its first is running", async () => {
    const { app, held } = await buildServer();

    const first = app.inject({ method: "GET", url: "/secrets", headers: { "x-org-id": "org-a" } });
    await flush();
    const second = await app.inject({ method: "GET", url: "/secrets", headers: { "x-org-id": "org-a" } });

    expect(second.statusCode).toBe(429);
    expect(second.headers["retry-after"]).toBe("1");
    expect(second.json<{ message: string }>().message).toMatch(/too many secret list requests in progress/);

    held[0].finish();
    expect((await first).statusCode).toBe(200);
  });

  test("does not hold back another organization", async () => {
    const { app, held } = await buildServer();

    const first = app.inject({ method: "GET", url: "/secrets", headers: { "x-org-id": "org-a" } });
    const other = app.inject({ method: "GET", url: "/secrets", headers: { "x-org-id": "org-b" } });
    await flush();

    expect(held).toHaveLength(2);
    held.forEach((request) => request.finish());
    expect((await first).statusCode).toBe(200);
    expect((await other).statusCode).toBe(200);
  });

  test("runs a queued request once the running one finishes", async () => {
    config.SECRET_READ_MAX_QUEUE_DEPTH = 1;
    const { app, held } = await buildServer();

    const first = app.inject({ method: "GET", url: "/secrets", headers: { "x-org-id": "org-a" } });
    const queued = app.inject({ method: "GET", url: "/secrets", headers: { "x-org-id": "org-a" } });
    await flush();
    expect(held).toHaveLength(1);

    held[0].finish();
    await flush();
    expect(held).toHaveLength(2);
    held[1].finish();

    expect((await first).statusCode).toBe(200);
    expect((await queued).statusCode).toBe(200);
  });

  test("refuses a queued request that waits longer than the queue wait", async () => {
    Object.assign(config, { SECRET_READ_MAX_QUEUE_DEPTH: 1, SECRET_READ_MAX_QUEUE_WAIT_MS: 10 });
    const { app, held } = await buildServer();

    const first = app.inject({ method: "GET", url: "/secrets", headers: { "x-org-id": "org-a" } });
    await flush();
    const queued = await app.inject({ method: "GET", url: "/secrets", headers: { "x-org-id": "org-a" } });

    expect(queued.statusCode).toBe(429);
    held[0].finish();
    expect((await first).statusCode).toBe(200);
  });

  test("frees the slot when the request fails", async () => {
    const { app, held } = await buildServer();

    const failing = app.inject({ method: "GET", url: "/secrets", headers: { "x-org-id": "org-a" } });
    await flush();
    held[0].fail();
    expect((await failing).statusCode).toBe(500);

    const next = app.inject({ method: "GET", url: "/secrets", headers: { "x-org-id": "org-a" } });
    await flush();
    held[1].finish();
    expect((await next).statusCode).toBe(200);
  });

  test("leaves routes without the flag, requests without an organization, and a disabled limit alone", async () => {
    const { app, held } = await buildServer();
    const unflagged = [0, 1].map(() =>
      app.inject({ method: "GET", url: "/folders", headers: { "x-org-id": "org-a" } })
    );
    const anonymous = [0, 1].map(() => app.inject({ method: "GET", url: "/secrets" }));
    await flush();
    expect(held).toHaveLength(4);
    held.forEach((request) => request.finish());
    expect((await Promise.all([...unflagged, ...anonymous])).map((res) => res.statusCode)).toEqual([
      200, 200, 200, 200
    ]);

    config.SECRET_READ_CONCURRENCY_LIMIT_ENABLED = false;
    const disabled = await buildServer();
    const requests = [0, 1].map(() =>
      disabled.app.inject({ method: "GET", url: "/secrets", headers: { "x-org-id": "org-a" } })
    );
    await flush();
    expect(disabled.held).toHaveLength(2);
    disabled.held.forEach((request) => request.finish());
    expect((await Promise.all(requests)).map((res) => res.statusCode)).toEqual([200, 200]);
  });
});
