import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { brotliCompress, constants as zlibConstants, gzip } from "node:zlib";

import yaml from "yaml";

import { ApiDocsTags } from "@app/lib/api-docs";

const gzipAsync = promisify(gzip);
const brotliCompressAsync = promisify(brotliCompress);

export type TOpenApiEncoding = "br" | "gzip";

export type TOpenApiDocument = {
  paths?: Record<string, Record<string, { tags?: string[] }>>;
};

export type TOpenApiArtifactMeta = {
  contentType: string;
  etagBase: string;
  uncompressedBytes: number;
  brBytes: number;
  gzipBytes: number;
};

export type TOpenApiArtifact = TOpenApiArtifactMeta & { br: Buffer; gzip: Buffer };

export const OPENAPI_MANIFEST_FILE = "manifest.json";
export const OPENAPI_JSON_ARTIFACT = "openapi.json";
export const OPENAPI_YAML_ARTIFACT = "openapi.yaml";

const JSON_CONTENT_TYPE = "application/json; charset=utf-8";
const YAML_CONTENT_TYPE = "application/x-yaml";

// the tags are matched by slug ("secret-tags" for "Secret Tags") so agents can pass them without encoding
export const TAG_BY_SLUG: Record<string, ApiDocsTags> = Object.fromEntries(
  Object.values(ApiDocsTags).map((tag) => [tag.toLowerCase().replace(/[^a-z0-9]+/g, "-"), tag])
);

export const taggedArtifactName = (slug: string) => `tags/${slug}.json`;

export const encodedFileName = (name: string, encoding: TOpenApiEncoding) =>
  `${name}.${encoding === "br" ? "br" : "gz"}`;

const filterSpecByTag = (spec: TOpenApiDocument, tag: ApiDocsTags): TOpenApiDocument => {
  const paths: NonNullable<TOpenApiDocument["paths"]> = {};
  for (const [url, operations] of Object.entries(spec.paths ?? {})) {
    const kept = Object.entries(operations).filter(([, operation]) => operation.tags?.includes(tag));
    if (kept.length) paths[url] = Object.fromEntries(kept);
  }
  return { ...spec, paths };
};

type TRenderArtifact = (spec: TOpenApiDocument) => { text: string; contentType: string };

const RENDER_BY_ARTIFACT = new Map<string, TRenderArtifact>([
  [OPENAPI_JSON_ARTIFACT, (spec) => ({ text: JSON.stringify(spec), contentType: JSON_CONTENT_TYPE })],
  // Converted from the same object rather than asking @fastify/swagger for YAML, which rebuilds the
  // whole spec from the routes first.
  [
    OPENAPI_YAML_ARTIFACT,
    (spec) => ({ text: yaml.stringify(spec, { strict: false }), contentType: YAML_CONTENT_TYPE })
  ],
  ...Object.entries(TAG_BY_SLUG).map(([slug, tag]): [string, TRenderArtifact] => [
    taggedArtifactName(slug),
    (spec) => ({ text: JSON.stringify(filterSpecByTag(spec, tag)), contentType: JSON_CONTENT_TYPE })
  ])
]);

export const OPENAPI_ARTIFACT_NAMES = [...RENDER_BY_ARTIFACT.keys()];

export const buildOpenApiArtifact = async (spec: TOpenApiDocument, name: string): Promise<TOpenApiArtifact> => {
  const render = RENDER_BY_ARTIFACT.get(name);
  if (!render) throw new Error(`Unknown OpenAPI spec file '${name}'`);

  const { text, contentType } = render(spec);
  const body = Buffer.from(text, "utf8");
  const [br, gzipped] = await Promise.all([
    brotliCompressAsync(body, {
      params: {
        [zlibConstants.BROTLI_PARAM_QUALITY]: 5,
        [zlibConstants.BROTLI_PARAM_SIZE_HINT]: body.byteLength
      }
    }),
    gzipAsync(body)
  ]);

  return {
    contentType,
    etagBase: createHash("sha256").update(body).digest("base64"),
    uncompressedBytes: body.byteLength,
    brBytes: br.byteLength,
    gzipBytes: gzipped.byteLength,
    br,
    gzip: gzipped
  };
};

export const buildOpenApiArtifacts = async (spec: TOpenApiDocument) => {
  const artifacts = await Promise.all(
    OPENAPI_ARTIFACT_NAMES.map(async (name) => [name, await buildOpenApiArtifact(spec, name)] as const)
  );
  return new Map<string, TOpenApiArtifact>(artifacts);
};

export const writeOpenApiArtifacts = async (artifacts: Map<string, TOpenApiArtifact>, dir: string) => {
  await mkdir(path.join(dir, "tags"), { recursive: true });

  const manifest: Record<string, TOpenApiArtifactMeta> = {};
  await Promise.all(
    [...artifacts].map(async ([name, { br, gzip: gzipped, ...meta }]) => {
      manifest[name] = meta;
      await Promise.all([
        writeFile(path.join(dir, encodedFileName(name, "br")), br),
        writeFile(path.join(dir, encodedFileName(name, "gzip")), gzipped)
      ]);
    })
  );

  // Written last: the server treats a manifest as proof the files next to it are complete.
  await writeFile(path.join(dir, OPENAPI_MANIFEST_FILE), JSON.stringify(manifest));
};
