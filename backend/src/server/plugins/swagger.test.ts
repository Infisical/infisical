import { brotliDecompressSync, gunzipSync } from "node:zlib";

import cors from "@fastify/cors";
import fastifyEtag from "@fastify/etag";
import Fastify, { FastifyInstance } from "fastify";
import { beforeAll, describe, expect, test } from "vitest";
import { z } from "zod";

import { serializerCompiler, validatorCompiler, ZodTypeProvider } from "./fastify-zod";
import { fastifySwagger } from "./swagger";

const buildServer = async ({ corsOrigin }: { corsOrigin?: string | string[] } = {}) => {
  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(fastifyEtag);
  if (corsOrigin) await app.register(cors, { credentials: true, origin: corsOrigin });
  await app.register(fastifySwagger);

  for (let i = 0; i < 40; i += 1) {
    app.route({
      method: "GET",
      url: `/api/v1/things-${i}/:id`,
      schema: {
        hide: false,
        operationId: `getThing${i}`,
        tags: ["Things"],
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: z.object({
            id: z.string().uuid(),
            name: z.string().max(64).describe("The name of the thing")
          })
        }
      },
      handler: async () => ({ id: "00000000-0000-0000-0000-000000000000", name: "thing" })
    });
  }

  await app.ready();
  app.swagger();
  return app;
};

describe("OpenAPI spec routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildServer();
    return async () => {
      await app.close();
    };
  });

  const getSpec = (headers: Record<string, string> = {}, url = "/api/docs/json") =>
    app.inject({ method: "GET", url, headers });

  test("serves the spec uncompressed when the client advertises no encoding", async () => {
    const res = await getSpec();

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/json; charset=utf-8");
    expect(res.headers["content-encoding"]).toBeUndefined();
    expect((JSON.parse(res.body) as { paths: Record<string, unknown> }).paths).toHaveProperty("/api/v1/things-0/{id}");
  });

  test("marks the response cacheable and varying on the encoding", async () => {
    const res = await getSpec();

    expect(res.headers["cache-control"]).toBe("public, max-age=600");
    expect(res.headers.vary).toBe("accept-encoding");
  });

  test("compresses with brotli when the client names it", async () => {
    const identity = await getSpec();
    const res = await getSpec({ "accept-encoding": "br, gzip" });

    expect(res.headers["content-encoding"]).toBe("br");
    expect(brotliDecompressSync(res.rawPayload).toString("utf8")).toBe(identity.body);
    expect(res.rawPayload.byteLength).toBeLessThan(identity.rawPayload.byteLength);
  });

  test("compresses with gzip when brotli is not offered", async () => {
    const identity = await getSpec();
    const res = await getSpec({ "accept-encoding": "gzip, deflate" });

    expect(res.headers["content-encoding"]).toBe("gzip");
    expect(gunzipSync(res.rawPayload).toString("utf8")).toBe(identity.body);
    expect(Number(res.headers["content-length"])).toBe(res.rawPayload.byteLength);
  });

  test("does not infer brotli support from a wildcard", async () => {
    const res = await getSpec({ "accept-encoding": "*" });

    expect(res.headers["content-encoding"]).toBe("gzip");
  });

  test("honours an encoding the client rejects with q=0", async () => {
    const res = await getSpec({ "accept-encoding": "gzip;q=0" });

    expect(res.headers["content-encoding"]).toBeUndefined();
  });

  test("answers a conditional request for the same encoding with 304", async () => {
    const gzipped = await getSpec({ "accept-encoding": "gzip" });
    const res = await getSpec({
      "accept-encoding": "gzip",
      "if-none-match": gzipped.headers.etag as string
    });

    expect(res.statusCode).toBe(304);
    expect(res.body).toBe("");
  });

  test("does not answer 304 when the client's etag is for a different encoding", async () => {
    const identity = await getSpec();
    const res = await getSpec({
      "accept-encoding": "gzip",
      "if-none-match": identity.headers.etag as string
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-encoding"]).toBe("gzip");
  });

  test("returns identical bytes and etag on every hit", async () => {
    const first = await getSpec();
    const second = await getSpec();

    expect(second.rawPayload.equals(first.rawPayload)).toBe(true);
    expect(second.headers.etag).toBe(first.headers.etag);
  });

  test("keeps the exact content types @fastify/swagger-ui sent, charset included", async () => {
    const json = await getSpec();
    const yamlRes = await getSpec({}, "/api/docs/yaml");

    // A consumer comparing the header exactly must not notice the handler swap.
    expect(json.headers["content-type"]).toBe("application/json; charset=utf-8");
    expect(yamlRes.headers["content-type"]).toBe("application/x-yaml");
  });

  test("still answers HEAD", async () => {
    const res = await app.inject({ method: "HEAD", url: "/api/docs/json" });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/json; charset=utf-8");
  });

  test("serves the yaml spec the same way", async () => {
    const res = await getSpec({ "accept-encoding": "br" }, "/api/docs/yaml");

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/x-yaml");
    expect(brotliDecompressSync(res.rawPayload).toString("utf8")).toContain("openapi:");
  });

  test("leaves the Swagger UI routes untouched", async () => {
    const ui = await app.inject({ method: "GET", url: "/api/docs/" });
    const asset = await app.inject({ method: "GET", url: "/api/docs/static/swagger-ui.css" });

    expect(ui.statusCode).toBe(200);
    expect(ui.headers["content-type"]).toContain("text/html");
    expect(asset.statusCode).toBe(200);
  });

  test("does not let non-canonical or encoded paths reach Swagger UI assets", async () => {
    const duplicateSlash = await app.inject({ method: "GET", url: "/api/docs/static//swagger-ui.css" });
    const encodedSeparator = await app.inject({ method: "GET", url: "/api/docs/static%2Fswagger-ui.css" });

    expect(duplicateSlash.statusCode).toBe(403);
    expect(duplicateSlash.body).not.toContain(".swagger-ui");
    expect(encodedSeparator.statusCode).toBe(404);
    expect(encodedSeparator.body).not.toContain(".swagger-ui");
  });

  test("keeps the Vary entries other plugins already set", async () => {
    // app.ts passes an array whenever CORS_ALLOWED_ORIGINS is configured, which makes
    // @fastify/cors add Vary: Origin on its onRequest hook, before this plugin's preHandler.
    const withCors = await buildServer({ corsOrigin: ["https://app.example", "https://eu.example"] });

    const res = await withCors.inject({
      method: "GET",
      url: "/api/docs/json",
      headers: { origin: "https://eu.example", "accept-encoding": "br" }
    });

    const vary = String(res.headers.vary)
      .split(",")
      .map((entry) => entry.trim().toLowerCase());

    // Without Origin here, a shared cache could hand this origin's
    // Access-Control-Allow-Origin to a request from the other one.
    expect(vary).toContain("origin");
    expect(vary).toContain("accept-encoding");
    expect(res.headers["access-control-allow-origin"]).toBe("https://eu.example");

    await withCors.close();
  });

  test("does not duplicate a Vary entry that is already present", async () => {
    const res = await getSpec();

    expect(String(res.headers.vary)).toBe("accept-encoding");
  });

  test("builds the payload once when a cold server is hit concurrently", async () => {
    const cold = await buildServer();

    const responses = await Promise.all(
      Array.from({ length: 25 }, () =>
        cold.inject({ method: "GET", url: "/api/docs/json", headers: { "accept-encoding": "br" } })
      )
    );

    expect(responses.every((res) => res.statusCode === 200)).toBe(true);
    expect(responses.every((res) => res.rawPayload.equals(responses[0].rawPayload))).toBe(true);

    await cold.close();
  });
});
