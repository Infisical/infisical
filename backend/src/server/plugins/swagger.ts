import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { brotliCompress, constants as zlibConstants, gzip } from "node:zlib";

import swagger from "@fastify/swagger";
import swaggerUI from "@fastify/swagger-ui";
import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";

import { jsonSchemaTransform } from "./fastify-zod";

const DOCS_ROUTE_PREFIX = "/api/docs";
const SPEC_CACHE_MAX_AGE_SECONDS = 600;

const gzipAsync = promisify(gzip);
const brotliCompressAsync = promisify(brotliCompress);

type SpecFormat = "json" | "yaml";
type SpecEncoding = "br" | "gzip";

type SpecPayload = {
  contentType: string;
  etagBase: string;
  identity: Buffer;
  br: Buffer;
  gzip: Buffer;
};

const SPEC_FORMAT_BY_ROUTE: Record<string, SpecFormat> = {
  [`${DOCS_ROUTE_PREFIX}/json`]: "json",
  [`${DOCS_ROUTE_PREFIX}/yaml`]: "yaml"
};

const buildSpecPayload = async (fastify: FastifyInstance, format: SpecFormat): Promise<SpecPayload> => {
  const isYaml = format === "yaml";
  const body = isYaml ? fastify.swagger({ yaml: true }) : JSON.stringify(fastify.swagger());
  const contentType = isYaml ? "application/x-yaml" : "application/json; charset=utf-8";

  const identity = Buffer.from(body, "utf8");

  const [brotlied, gzipped] = await Promise.all([
    brotliCompressAsync(identity, {
      params: {
        [zlibConstants.BROTLI_PARAM_QUALITY]: 5,
        [zlibConstants.BROTLI_PARAM_SIZE_HINT]: identity.byteLength
      }
    }),
    gzipAsync(identity)
  ]);

  fastify.log.info(
    {
      format,
      identityBytes: identity.byteLength,
      brotliBytes: brotlied.byteLength,
      gzipBytes: gzipped.byteLength
    },
    "Cached OpenAPI spec payload"
  );

  return {
    contentType,
    etagBase: createHash("sha256").update(identity).digest("base64"),
    identity,
    br: brotlied,
    gzip: gzipped
  };
};

const pickSpecEncoding = (header: FastifyRequest["headers"]["accept-encoding"]): SpecEncoding | null => {
  if (!header) return null;

  const weights = new Map<string, number>();
  for (const directive of (Array.isArray(header) ? header.join(",") : header).split(",")) {
    const [token, ...params] = directive.trim().split(";");

    if (token) {
      const quality = params.map((param) => param.trim()).find((param) => param.startsWith("q="));
      const parsed = quality ? Number(quality.slice(2)) : 1;
      weights.set(token.toLowerCase(), Number.isNaN(parsed) ? 1 : parsed);
    }
  }

  if ((weights.get("br") ?? 0) > 0) return "br";
  if ((weights.get("gzip") ?? weights.get("*") ?? 0) > 0) return "gzip";
  return null;
};

export const fastifySwagger = fp(async (fastify) => {
  await fastify.register(swagger, {
    transform: jsonSchemaTransform,
    openapi: {
      info: {
        title: "Infisical API",
        description: "List of all available APIs that can be consumed",
        version: "0.0.1"
      },
      servers: [
        {
          url: "https://us.infisical.com",
          description: "Production server (US)"
        },
        {
          url: "https://eu.infisical.com",
          description: "Production server (EU)"
        },
        {
          url: "http://localhost:8080",
          description: "Local server"
        }
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
            description: "An access token in Infisical"
          }
        }
      }
    }
  });

  const specPayloads = new Map<SpecFormat, Promise<SpecPayload>>();

  const getSpecPayload = (format: SpecFormat) => {
    const cached = specPayloads.get(format);
    if (cached) return cached;

    const pending = buildSpecPayload(fastify, format).catch((err) => {
      specPayloads.delete(format);
      throw err;
    });

    specPayloads.set(format, pending);
    return pending;
  };

  const serveSpec = async (req: FastifyRequest, reply: FastifyReply, format: SpecFormat) => {
    const payload = await getSpecPayload(format);
    const encoding = pickSpecEncoding(req.headers["accept-encoding"]);

    void reply
      .header("content-type", payload.contentType)
      .header("etag", `"${payload.etagBase}${encoding ? `-${encoding}` : ""}"`)
      .header("cache-control", `public, max-age=${SPEC_CACHE_MAX_AGE_SECONDS}`)
      .header("vary", "accept-encoding");

    if (encoding) void reply.header("content-encoding", encoding);

    await reply.send(encoding ? payload[encoding] : payload.identity);
  };

  await fastify.register(swaggerUI, {
    routePrefix: DOCS_ROUTE_PREFIX,
    uiHooks: {
      preHandler: (req, reply, done) => {
        const format = SPEC_FORMAT_BY_ROUTE[req.routeOptions.url ?? ""];

        if (!format) {
          done();
          return;
        }

        void serveSpec(req, reply, format).catch((err) => done(err as Error));
      }
    }
  });
});
