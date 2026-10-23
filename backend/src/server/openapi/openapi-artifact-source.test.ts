import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { beforeEach, expect, test, vi } from "vitest";

import {
  buildOpenApiArtifact,
  buildOpenApiArtifacts,
  encodedFileName,
  TOpenApiDocument,
  writeOpenApiArtifacts
} from "./build-openapi-artifacts";
import { createDiskArtifactSource, createInMemoryArtifactSource } from "./openapi-artifact-source";

// Wrapped rather than replaced so the builds stay real while the test can count them.
vi.mock("./build-openapi-artifacts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./build-openapi-artifacts")>();
  return { ...actual, buildOpenApiArtifact: vi.fn(actual.buildOpenApiArtifact) };
});

const buildArtifact = vi.mocked(buildOpenApiArtifact);

beforeEach(() => {
  buildArtifact.mockClear();
});

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

test("builds each file once when a server running from source is hit concurrently", async () => {
  const getSpec = vi.fn((): TOpenApiDocument => ({ paths: {} }));
  const source = createInMemoryArtifactSource(getSpec);

  await Promise.all(Array.from({ length: 5 }, () => [source.get("openapi.json"), source.get("openapi.yaml")]).flat());

  expect(getSpec).toHaveBeenCalledTimes(1);
  expect(buildArtifact).toHaveBeenCalledTimes(2);
});

test("retries a build that failed on the next request", async () => {
  const source = createInMemoryArtifactSource(() => ({ paths: {} }));
  buildArtifact.mockRejectedValueOnce(new Error("build failed"));

  await expect(source.get("openapi.json")).rejects.toThrow("build failed");
  await expect(source.get("openapi.json")).resolves.toMatchObject({ contentType: "application/json; charset=utf-8" });
});
