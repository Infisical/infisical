import { createReadStream, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";

import {
  buildOpenApiArtifact,
  encodedFileName,
  OPENAPI_ARTIFACT_NAMES,
  OPENAPI_MANIFEST_FILE,
  TOpenApiArtifact,
  TOpenApiArtifactMeta,
  TOpenApiDocument,
  TOpenApiEncoding
} from "./build-openapi-artifacts";

export type TOpenApiArtifactHandle = TOpenApiArtifactMeta & {
  open: (encoding: TOpenApiEncoding) => Readable;
};

export type TOpenApiArtifactSource = {
  get: (name: string) => Promise<TOpenApiArtifactHandle>;
};

const ENCODINGS: TOpenApiEncoding[] = ["br", "gzip"];

export const createDiskArtifactSource = (dir: string): TOpenApiArtifactSource => {
  const manifestPath = path.join(dir, OPENAPI_MANIFEST_FILE);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, TOpenApiArtifactMeta>;

  // Checked up front so a broken build fails at boot rather than on whichever request first needs the file.
  const missing = OPENAPI_ARTIFACT_NAMES.flatMap((name) =>
    manifest[name]
      ? ENCODINGS.map((encoding) => encodedFileName(name, encoding)).filter((file) => !existsSync(path.join(dir, file)))
      : [name]
  );
  if (missing.length) {
    throw new Error(
      `The OpenAPI spec files in '${dir}' are incomplete, missing: ${missing.join(", ")}. Run 'npm run build' to regenerate them.`
    );
  }

  return {
    get: async (name) => ({
      ...manifest[name],
      open: (encoding) => createReadStream(path.join(dir, encodedFileName(name, encoding)))
    })
  };
};

export const createInMemoryArtifactSource = (getSpec: () => TOpenApiDocument): TOpenApiArtifactSource => {
  let spec: TOpenApiDocument | undefined;
  const artifacts = new Map<string, Promise<TOpenApiArtifact>>();

  return {
    get: async (name) => {
      let pending = artifacts.get(name);
      if (!pending) {
        spec ??= getSpec();
        pending = buildOpenApiArtifact(spec, name).catch((err) => {
          artifacts.delete(name);
          throw err;
        });
        artifacts.set(name, pending);
      }

      const { br, gzip, ...meta } = await pending;
      return { ...meta, open: (encoding) => Readable.from(encoding === "br" ? br : gzip) };
    }
  };
};
