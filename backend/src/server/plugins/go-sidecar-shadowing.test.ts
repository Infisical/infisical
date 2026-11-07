import fastify, { FastifyInstance } from "fastify";
import http from "http";
import { AddressInfo } from "net";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { shadowToGoSidecar } from "./go-sidecar-shadowing";

const log = vi.hoisted(() => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }));
vi.mock("@app/lib/logger", () => ({ logger: log }));

const folder = (overrides: Record<string, unknown> = {}) => ({
  id: "7f1e3c1e-0000-4000-8000-000000000001",
  name: "app",
  version: 1,
  createdAt: "2026-01-02T03:04:05.678Z",
  updatedAt: "2026-01-02T03:04:05.678Z",
  envId: "7f1e3c1e-0000-4000-8000-000000000002",
  parentId: "7f1e3c1e-0000-4000-8000-000000000003",
  isReserved: false,
  description: null,
  lastSecretModified: null,
  ...overrides
});

describe("shadowing GET /api/v2/folders", () => {
  let node: FastifyInstance;
  let goServer: http.Server;
  let nodeBody: unknown;
  let goStatus: number;
  let goBody: unknown;

  beforeEach(async () => {
    log.info.mockReset();
    log.error.mockReset();
    nodeBody = { folders: [folder()] };
    goStatus = 200;
    goBody = { folders: [folder()] };

    goServer = http.createServer((_req, res) => {
      res.writeHead(goStatus, { "content-type": "application/json" });
      res.end(JSON.stringify(goBody));
    });
    await new Promise<void>((resolve) => {
      goServer.listen(0, "127.0.0.1", resolve);
    });

    node = fastify();
    await node.register(shadowToGoSidecar, {
      sidecarUrl: `http://127.0.0.1:${(goServer.address() as AddressInfo).port}`,
      sampleRate: 100
    });
    node.decorateRequest("realIp", "127.0.0.1");
    node.get("/api/v2/folders", async () => nodeBody);
    await node.ready();
  });

  afterEach(async () => {
    await node.close();
    await new Promise((resolve) => {
      goServer.close(resolve);
    });
  });

  const shadow = async () => {
    const res = await node.inject({ method: "GET", url: "/api/v2/folders?projectId=p&environment=dev&path=/" });
    expect(res.statusCode).toBe(200);
    await vi.waitFor(() => expect(log.info.mock.calls.length + log.error.mock.calls.length).toBeGreaterThan(0));
    return log.error.mock.calls[0] as [Record<string, unknown>, string] | undefined;
  };

  test("reports a match for identical folder lists", async () => {
    expect(await shadow()).toBeUndefined();
    expect(log.info).toHaveBeenCalledWith(expect.anything(), expect.stringContaining("[Shadow:success]"));
  });

  test("reports a match for an empty folder list", async () => {
    nodeBody = { folders: [] };
    goBody = { folders: [] };
    expect(await shadow()).toBeUndefined();
  });

  test("reports a match for recursive results with relativePath", async () => {
    nodeBody = { folders: [folder({ relativePath: "/a" }), folder({ id: "x", name: "b", relativePath: "/a/b" })] };
    goBody = { folders: [folder({ relativePath: "/a" }), folder({ id: "x", name: "b", relativePath: "/a/b" })] };
    expect(await shadow()).toBeUndefined();
  });

  test("reports a folder missing from Go", async () => {
    goBody = { folders: [] };
    const [fields] = (await shadow())!;
    expect(fields.route).toBe("/api/v2/folders");
    expect(fields.missingInGo).toEqual(["folders"]);
  });

  test("reports a differing folder name", async () => {
    goBody = { folders: [folder({ name: "other" })] };
    const [fields] = (await shadow())!;
    expect(fields.valueMismatches).toEqual([
      { path: "folders[0].name", type: "value_mismatch", nodeValue: "app", goValue: "other" }
    ]);
  });

  test("reports reordered folders", async () => {
    nodeBody = { folders: [folder({ name: "a" }), folder({ name: "b" })] };
    goBody = { folders: [folder({ name: "b" }), folder({ name: "a" })] };
    const [fields] = (await shadow())!;
    expect(fields.totalDiffs).toBe(2);
  });

  test("reports a column Go does not return", async () => {
    nodeBody = { folders: [folder({ description: "docs" })] };
    const { description: _description, ...withoutDescription } = folder();
    goBody = { folders: [withoutDescription] };
    const [fields] = (await shadow())!;
    expect(fields.missingInGo).toEqual(["folders[0].description"]);
  });

  test("reports a status code mismatch", async () => {
    goStatus = 404;
    const [, message] = (await shadow())!;
    expect(message).toContain("Status code mismatch");
  });
});
