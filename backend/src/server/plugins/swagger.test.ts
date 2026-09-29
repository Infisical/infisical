import { brotliDecompressSync, gunzipSync } from "node:zlib";

import cors from "@fastify/cors";
import fastifyEtag from "@fastify/etag";
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from "@fastify/type-provider-zod";
import Fastify, { FastifyInstance } from "fastify";
import { beforeAll, describe, expect, test } from "vitest";
import { z } from "zod";

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
        params: z.object({ id: z.string().guid() }),
        response: {
          200: z.object({
            id: z.string().guid(),
            name: z.string().max(64).describe("The name of the thing")
          })
        }
      },
      handler: async () => ({ id: "00000000-0000-0000-0000-000000000000", name: "thing" })
    });
  }

  const hidden = JSON.stringify({ "x-hidden": true });

  app.route({
    method: "POST",
    url: "/api/v1/widgets",
    schema: {
      hide: false,
      operationId: "createWidget",
      body: z.object({
        name: z.string().describe(JSON.stringify({ title: "Widget name" })),
        internalFlag: z.boolean().describe(hidden)
      }),
      response: {
        200: z.object({ widget: z.object({ id: z.string(), internalNote: z.string().describe(hidden) }) })
      }
    },
    handler: async () => ({ widget: { id: "w", internalNote: "n" } })
  });

  const widgetWithProject = z.object({
    id: z.string(),
    projectId: z.string(),
    children: z.object({ name: z.string(), projectId: z.string() }).array()
  });

  app.route({
    method: "GET",
    url: "/api/v1/cert-manager/widgets/:id",
    schema: {
      hide: false,
      operationId: "getCertManagerWidget",
      response: { 200: z.object({ widget: widgetWithProject }) }
    },
    handler: async () => ({ widget: { id: "w", projectId: "p", children: [] } })
  });

  app.route({
    method: "GET",
    url: "/api/v1/projects/:projectId/widgets",
    schema: {
      hide: false,
      operationId: "listProjectWidgets",
      response: { 200: z.object({ widget: widgetWithProject }) }
    },
    handler: async () => ({ widget: { id: "w", projectId: "p", children: [] } })
  });

  app.route({
    method: "GET",
    url: "/api/v1/internal-widgets",
    schema: { response: { 200: z.object({ id: z.string() }) } },
    handler: async () => ({ id: "w" })
  });

  app.get("/api/v1/schemaless-widgets", async () => ({ ok: true }));

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

  describe("published contract", () => {
    type TJsonSchema = {
      properties?: Record<string, TJsonSchema>;
      required?: string[];
      items?: TJsonSchema;
      title?: string;
      description?: string;
    };
    type TOperation = {
      requestBody?: { content: { "application/json": { schema: TJsonSchema } } };
      responses: Record<string, { content: { "application/json": { schema: TJsonSchema } } }>;
    };
    type TSpec = { paths: Record<string, Record<string, TOperation>> };

    let spec: TSpec;

    beforeAll(async () => {
      spec = JSON.parse((await getSpec()).body) as TSpec;
    });

    const operation = (path: string, method: string) => spec.paths[path][method];
    const requestBody = (path: string, method: string) =>
      operation(path, method).requestBody?.content["application/json"].schema;
    const response = (path: string, method: string) =>
      operation(path, method).responses["200"].content["application/json"].schema;

    test("drops x-hidden fields from request bodies and their required list", () => {
      const body = requestBody("/api/v1/widgets", "post");

      expect(Object.keys(body?.properties ?? {})).toEqual(["name"]);
      expect(body?.required).toEqual(["name"]);
    });

    test("drops x-hidden fields from responses and their required list", () => {
      const widget = response("/api/v1/widgets", "post").properties?.widget;

      expect(Object.keys(widget?.properties ?? {})).toEqual(["id"]);
      expect(widget?.required).toEqual(["id"]);
    });

    test("merges JSON descriptions into the schema instead of publishing them as text", () => {
      const name = requestBody("/api/v1/widgets", "post")?.properties?.name;

      expect(name?.title).toBe("Widget name");
      expect(name?.description).toBeUndefined();
    });

    test("strips projectId at every depth of a cert-manager response", () => {
      const widget = response("/api/v1/cert-manager/widgets/{id}", "get").properties?.widget;
      const child = widget?.properties?.children?.items;

      expect(widget?.properties).not.toHaveProperty("projectId");
      expect(widget?.required).not.toContain("projectId");
      expect(child?.properties).not.toHaveProperty("projectId");
      expect(child?.required).toEqual(["name"]);
    });

    test("keeps projectId on responses outside cert-manager", () => {
      const widget = response("/api/v1/projects/{projectId}/widgets", "get").properties?.widget;

      expect(widget?.properties).toHaveProperty("projectId");
      expect(widget?.properties?.children?.items?.properties).toHaveProperty("projectId");
    });

    test("leaves routes out unless they opt in with hide: false", () => {
      expect(spec.paths).not.toHaveProperty("/api/v1/internal-widgets");
      expect(spec.paths).not.toHaveProperty("/api/v1/schemaless-widgets");
    });
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
