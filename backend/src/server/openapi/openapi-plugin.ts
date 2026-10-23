import { existsSync } from "node:fs";
import path from "node:path";
import { pipeline, Readable } from "node:stream";
import { createGunzip } from "node:zlib";

import swagger from "@fastify/swagger";
import swaggerUI from "@fastify/swagger-ui";
import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";

import { BadRequestError } from "@app/lib/errors";

import {
  OPENAPI_JSON_ARTIFACT,
  OPENAPI_MANIFEST_FILE,
  OPENAPI_YAML_ARTIFACT,
  TAG_BY_SLUG,
  taggedArtifactName,
  TOpenApiDocument,
  TOpenApiEncoding
} from "./build-openapi-artifacts";
import {
  createDiskArtifactSource,
  createInMemoryArtifactSource,
  TOpenApiArtifactSource
} from "./openapi-artifact-source";
import { openApiSwaggerOptions } from "./openapi-swagger-options";

const DOCS_ROUTE_PREFIX = "/api/docs";
const SPEC_CACHE_MAX_AGE_SECONDS = 600;

type SpecFormat = "json" | "yaml";

const SPEC_FORMAT_BY_ROUTE: Record<string, SpecFormat> = {
  [`${DOCS_ROUTE_PREFIX}/json`]: "json",
  [`${DOCS_ROUTE_PREFIX}/yaml`]: "yaml"
};

const SpecQuerySchema = z.object({
  tag: z.enum(Object.keys(TAG_BY_SLUG) as [string, ...string[]]).optional()
});

const artifactNameFor = (format: SpecFormat, tagSlug?: string) => {
  if (format === "yaml") return OPENAPI_YAML_ARTIFACT;
  return tagSlug ? taggedArtifactName(tagSlug) : OPENAPI_JSON_ARTIFACT;
};

const appendVary = (reply: FastifyReply, field: string) => {
  const current = reply.getHeader("vary");
  const joined = Array.isArray(current) ? current.join(",") : current;
  const existing = (typeof joined === "string" ? joined : "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (existing.some((entry) => entry === "*" || entry.toLowerCase() === field)) return;

  void reply.header("vary", [...existing, field].join(", "));
};

const pickSpecEncoding = (header: FastifyRequest["headers"]["accept-encoding"]): TOpenApiEncoding | null => {
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

// Same matching rules as @fastify/etag.
const matchesEtag = (ifNoneMatch: string | undefined, etag: string) =>
  ifNoneMatch === etag || ifNoneMatch === `W/${etag}` || `W/${ifNoneMatch}` === etag;

const openApiDocs = fp(async (fastify, { source }: { source: TOpenApiArtifactSource }) => {
  const serveSpec = async (req: FastifyRequest, reply: FastifyReply, format: SpecFormat) => {
    const query = SpecQuerySchema.safeParse(req.query);
    if (!query.success) {
      throw new BadRequestError({
        message: `The tag '${String((req.query as { tag?: unknown }).tag)}' does not exist. Pass the lowercase, hyphenated name of an API docs tag (eg 'secret-tags').`
      });
    }
    const { tag } = query.data;
    const artifact = await source.get(artifactNameFor(format, tag));
    const encoding = pickSpecEncoding(req.headers["accept-encoding"]);
    const etag = `"${artifact.etagBase}${encoding ? `-${encoding}` : ""}"`;

    void reply
      .header("content-type", artifact.contentType)
      .header("etag", etag)
      .header("cache-control", `public, max-age=${SPEC_CACHE_MAX_AGE_SECONDS}`);

    appendVary(reply, "accept-encoding");

    // Answered here rather than left to @fastify/etag, which would swap the body for an empty string
    // after the file stream below had been opened, leaking its file descriptor.
    if (matchesEtag(req.headers["if-none-match"], etag)) {
      await reply.code(304).send();
      return;
    }

    if (encoding) {
      void reply
        .header("content-encoding", encoding)
        .header("content-length", encoding === "br" ? artifact.brBytes : artifact.gzipBytes);
    } else {
      void reply.header("content-length", artifact.uncompressedBytes);
    }

    // Fastify's HEAD handling reads a stream body to the end before discarding it, so sending the
    // file here would decompress the whole spec for nothing. An empty stream keeps the
    // content-length set above, which an undefined body would reset to 0.
    if (req.method === "HEAD") {
      await reply.send(Readable.from([]));
      return;
    }

    if (encoding) {
      await reply.send(artifact.open(encoding));
      return;
    }

    // Only compressed copies are stored. pipeline, unlike pipe, carries a read error through to the
    // response stream so the request fails instead of hanging; Fastify reports it from there.
    const body = createGunzip();
    pipeline(artifact.open("gzip"), body, () => {});
    await reply.send(body);
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

// Never served: the preHandler answers the JSON and YAML routes from the prebuilt files. Swagger UI
// only needs @fastify/swagger registered.
const STUB_DOCUMENT = { openapi: "3.0.3", info: { title: "Infisical API", version: "0.0.1" }, paths: {} };

// Must run before the routes are registered: from source, @fastify/swagger records them as they are added.
export const registerOpenApiDocs = async (
  server: FastifyInstance,
  { dir, nodeEnv }: { dir: string; nodeEnv: string }
) => {
  if (existsSync(path.join(dir, OPENAPI_MANIFEST_FILE))) {
    const source = createDiskArtifactSource(dir);
    await server.register(swagger, { mode: "static", specification: { document: STUB_DOCUMENT } });
    await server.register(openApiDocs, { source });
    return;
  }

  // Building the spec while serving requests is what blocked production event loops, so an image
  // without the files must not start.
  if (nodeEnv === "production") {
    throw new Error(
      `The OpenAPI spec files are missing from '${dir}'. 'npm run build' writes them; check that the image copies dist/openapi. When running from source (eg 'npm run dev'), set NODE_ENV=development to build the spec in memory instead.`
    );
  }

  // From source, the spec comes from this server's own routes. Registering them on a second server
  // instead would rebind state some routers keep at module level (eg the passport strategies in
  // sso-router.ts).
  await server.register(swagger, openApiSwaggerOptions({ full: true }));
  await server.register(openApiDocs, {
    source: createInMemoryArtifactSource(() => server.swagger() as unknown as TOpenApiDocument)
  });
};
