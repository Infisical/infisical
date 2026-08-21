import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import Fastify, { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { registerServeUI } from "./serve-ui";

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({
    CAPTCHA_SITE_KEY: undefined,
    CDN_HOST: "",
    INTERCOM_ID: undefined,
    POSTHOG_PROJECT_API_KEY: undefined,
    TELEMETRY_ENABLED: false,
    isCloud: false
  }),
  IS_PACKAGED: false
}));

vi.mock("re2", () => ({ default: RegExp }));

describe("standalone UI serving", () => {
  let app: FastifyInstance;
  let workspaceDir: string;

  beforeEach(async () => {
    workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "infisical-serve-ui-"));
    const frontendDir = path.join(workspaceDir, "frontend-build");

    await fs.mkdir(path.join(frontendDir, "assets"), { recursive: true });
    await Promise.all([
      fs.writeFile(path.join(frontendDir, "index.html"), "<!doctype html><title>Infisical UI</title>"),
      fs.writeFile(path.join(frontendDir, "assets", "app.js"), "window.__UI_ASSET_LOADED__ = true;"),
      fs.writeFile(path.join(workspaceDir, "outside.txt"), "outside-static-root-secret")
    ]);

    app = Fastify({ logger: false });
    await registerServeUI(app as unknown as Parameters<typeof registerServeUI>[0], {
      standaloneMode: true,
      dir: workspaceDir
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    await fs.rm(workspaceDir, { recursive: true, force: true });
  });

  test("serves built assets with long-lived immutable caching", async () => {
    const response = await app.inject({ method: "GET", url: "/assets/app.js" });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("window.__UI_ASSET_LOADED__ = true;");
    expect(response.headers["content-type"]).toBe("application/javascript; charset=utf-8");
    expect(response.headers["cache-control"]).toBe("public, max-age=2592000, immutable");
  });

  test("serves the SPA shell for client routes but not missing API routes", async () => {
    const clientRoute = await app.inject({ method: "GET", url: "/projects/example/secrets" });
    const apiRoute = await app.inject({ method: "GET", url: "/api/missing" });

    expect(clientRoute.statusCode).toBe(200);
    expect(clientRoute.body).toContain("<title>Infisical UI</title>");
    expect(clientRoute.headers["content-type"]).toBe("text/html");
    expect(clientRoute.headers["cache-control"]).toBe("no-cache, no-store, must-revalidate");
    expect(clientRoute.headers.pragma).toBe("no-cache");
    expect(clientRoute.headers.expires).toBe("0");

    expect(apiRoute.statusCode).toBe(404);
    expect(apiRoute.body).not.toContain("<title>Infisical UI</title>");
  });

  test("does not expose files outside the UI root through raw or encoded traversal paths", async () => {
    const traversalPaths = [
      "/../outside.txt",
      "/%2e%2e/outside.txt",
      "/assets/../outside.txt",
      "/assets/%2e%2e/outside.txt",
      "/assets/%252e%252e/outside.txt"
    ];

    const responses = await Promise.all(traversalPaths.map((url) => app.inject({ method: "GET", url })));

    for (const response of responses) {
      expect(response.statusCode).toBe(200);
      expect(response.body).toContain("<title>Infisical UI</title>");
      expect(response.body).not.toContain("outside-static-root-secret");
    }
  });
});
