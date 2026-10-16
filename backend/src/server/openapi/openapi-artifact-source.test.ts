import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { expect, test } from "vitest";

import { buildOpenApiArtifacts, encodedFileName, writeOpenApiArtifacts } from "./build-openapi-artifacts";
import { createDiskArtifactSource } from "./openapi-artifact-source";

test("refuses a manifest that lists a file missing from disk", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "openapi-source-test-"));
  try {
    await writeOpenApiArtifacts(await buildOpenApiArtifacts({ paths: {} }), dir);
    await rm(path.join(dir, encodedFileName("openapi.yaml", "br")));

    expect(() => createDiskArtifactSource(dir)).toThrow("openapi.yaml.br");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
