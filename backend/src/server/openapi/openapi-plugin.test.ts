import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { brotliDecompressSync, gunzipSync } from "node:zlib";

import cors from "@fastify/cors";
import fastifyEtag from "@fastify/etag";
import swagger from "@fastify/swagger";
import Fastify, { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import yaml from "yaml";
import { z } from "zod";

import { ApiDocsTags } from "@app/lib/api-docs";
import { BadRequestError } from "@app/lib/errors";

import { serializerCompiler, validatorCompiler, ZodTypeProvider } from "../plugins/fastify-zod";
import { buildOpenApiArtifacts, TOpenApiDocument, writeOpenApiArtifacts } from "./build-openapi-artifacts";
import { registerOpenApiDocs } from "./openapi-plugin";
import { openApiSwaggerOptions } from "./openapi-swagger-options";

const createZodServer = () => {
  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  return app;
};

const registerThingRoutes = (app: ReturnType<typeof createZodServer>) => {
  for (let i = 0; i < 40; i += 1) {
    app.route({
      method: "GET",
      url: `/api/v1/things-${i}/:id`,
      schema: {
        hide: false,
        operationId: `getThing${i}`,
        tags: [i % 2 === 0 ? ApiDocsTags.Instance : ApiDocsTags.Folders],
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
};

const buildTestSpec = async (): Promise<TOpenApiDocument> => {
  const app = createZodServer();
  await app.register(swagger, openApiSwaggerOptions({ full: false }));
  registerThingRoutes(app);
  await app.ready();
  const spec = app.swagger() as unknown as TOpenApiDocument;
  await app.close();
  return spec;
};

let spec: TOpenApiDocument;
let artifactsDir: string;

beforeAll(async () => {
  spec = await buildTestSpec();
  artifactsDir = await mkdtemp(path.join(os.tmpdir(), "openapi-plugin-test-"));
  await writeOpenApiArtifacts(await buildOpenApiArtifacts(spec), artifactsDir);
});

afterAll(async () => {
  await rm(artifactsDir, { recursive: true, force: true });
});

const buildServer = async ({ corsOrigin }: { corsOrigin?: string | string[] } = {}) => {
  const app = Fastify({ logger: false });
  // Stands in for app.ts's fastifyErrHandler, which needs the full env config to register.
  app.setErrorHandler((err, _req, reply) => reply.code(err instanceof BadRequestError ? 400 : 500).send(err));
  await app.register(fastifyEtag);
  if (corsOrigin) await app.register(cors, { credentials: true, origin: corsOrigin });
  await registerOpenApiDocs(app, { dir: artifactsDir, nodeEnv: "production" });
  await app.ready();
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
    expect(Number(res.headers["content-length"])).toBe(res.rawPayload.byteLength);
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
    const get = await app.inject({ method: "GET", url: "/api/docs/json" });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/json; charset=utf-8");
    expect(res.headers["content-length"]).toBe(String(get.rawPayload.byteLength));
    expect(res.rawPayload.byteLength).toBe(0);
  });

  test("serves the yaml spec the same way", async () => {
    const res = await getSpec({ "accept-encoding": "br" }, "/api/docs/yaml");

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/x-yaml");
    expect(brotliDecompressSync(res.rawPayload).toString("utf8")).toBe(yaml.stringify(spec, { strict: false }));
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

  test("answers a conditional request carrying the weak form of the etag with 304", async () => {
    const gzipped = await getSpec({ "accept-encoding": "gzip" });
    const res = await getSpec({
      "accept-encoding": "gzip",
      "if-none-match": `W/${gzipped.headers.etag as string}`
    });

    expect(res.statusCode).toBe(304);
  });

  test("filters the spec down to one tag's operations", async () => {
    const res = await getSpec({}, "/api/docs/json?tag=instance");
    const paths = Object.values((JSON.parse(res.body) as Required<TOpenApiDocument>).paths);

    expect(paths).toHaveLength(20);
    expect(paths.every((operations) => operations.get.tags?.includes(ApiDocsTags.Instance))).toBe(true);
  });

  test("rejects a tag that does not exist", async () => {
    const res = await getSpec({}, "/api/docs/json?tag=not-a-tag");

    expect(res.statusCode).toBe(400);
  });

  test("refuses to start a production server that has no spec files", async () => {
    const emptyDir = await mkdtemp(path.join(os.tmpdir(), "openapi-plugin-empty-"));

    await expect(registerOpenApiDocs(Fastify(), { dir: emptyDir, nodeEnv: "production" })).rejects.toThrow(emptyDir);

    await rm(emptyDir, { recursive: true, force: true });
  });

  test("serves identical bytes to concurrent first requests on a server running from source", async () => {
    const emptyDir = await mkdtemp(path.join(os.tmpdir(), "openapi-plugin-empty-"));
    const dev = createZodServer();
    await registerOpenApiDocs(dev, { dir: emptyDir, nodeEnv: "test" });
    registerThingRoutes(dev);
    await dev.ready();

    const responses = await Promise.all(
      Array.from({ length: 25 }, () =>
        dev.inject({ method: "GET", url: "/api/docs/json", headers: { "accept-encoding": "br" } })
      )
    );

    expect(responses.every((res) => res.statusCode === 200)).toBe(true);
    expect(responses.every((res) => res.rawPayload.equals(responses[0].rawPayload))).toBe(true);
    const devSpec = JSON.parse(brotliDecompressSync(responses[0].rawPayload).toString("utf8")) as TOpenApiDocument;
    expect(devSpec.paths).toHaveProperty("/api/v1/things-0/{id}");

    await dev.close();
    await rm(emptyDir, { recursive: true, force: true });
  });
});
