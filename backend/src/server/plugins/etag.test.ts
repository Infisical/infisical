import Fastify from "fastify";
import { describe, expect, test } from "vitest";

import { etag } from "./etag";

const buildServer = async () => {
  const app = Fastify({ logger: false });
  await app.register(etag);
  app.get("/things", async () => ({ id: 1, name: "thing" }));
  app.get("/cached", async (_req, reply) => {
    void reply.header("ETag", '"stored"');
    void reply.code(304).send();
  });
  await app.ready();
  return app;
};

describe("etag plugin", () => {
  test("should answer a matching If-None-Match with a 304 that has no body and no Content-Type", async () => {
    // Setup
    const app = await buildServer();
    const first = await app.inject({ method: "GET", url: "/things" });

    // Action
    const res = await app.inject({ method: "GET", url: "/things", headers: { "if-none-match": first.headers.etag } });

    // Assert
    expect(first.headers["content-type"]).toContain("application/json");
    expect(res.statusCode).toBe(304);
    expect(res.body).toBe("");
    expect(res.headers["content-type"]).toBeUndefined();
    expect(res.headers.etag).toBe(first.headers.etag);
  });

  test("should keep the body and Content-Type of a 200 whose ETag does not match", async () => {
    // Setup
    const app = await buildServer();

    // Action
    const res = await app.inject({ method: "GET", url: "/things", headers: { "if-none-match": '"stale"' } });

    // Assert
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("application/json");
    expect(res.json()).toEqual({ id: 1, name: "thing" });
  });

  test("should leave a 304 the route sends itself without a Content-Type", async () => {
    // Setup
    const app = await buildServer();

    // Action
    const res = await app.inject({ method: "GET", url: "/cached", headers: { "if-none-match": '"stored"' } });

    // Assert
    expect(res.statusCode).toBe(304);
    expect(res.headers["content-type"]).toBeUndefined();
  });
});
