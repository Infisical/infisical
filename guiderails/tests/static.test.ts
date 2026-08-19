import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { resolveStaticFile } from "../src/live/static.js";

/**
 * The dashboard server binds to localhost for a demo, so the stakes are low, but the traversal
 * guard is the kind of thing that is only ever tested once and it costs six lines to do it here.
 *
 * A temporary tree rather than the real `dashboard/dist/`, which is gitignored and so absent on a
 * fresh checkout and in CI.
 */

const root = fs.mkdtempSync(path.join(os.tmpdir(), "guiderails-static-"));
fs.mkdirSync(path.join(root, "assets"));
fs.writeFileSync(path.join(root, "index.html"), "<!doctype html>");
fs.writeFileSync(path.join(root, "assets", "app-abc123.js"), "export {}");
fs.writeFileSync(path.join(path.dirname(root), "guiderails-static-secret"), "not yours");

afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

describe("resolveStaticFile", () => {
  it("serves the entry point for the root path", () => {
    expect(resolveStaticFile(root, "/")).toBe(path.join(root, "index.html"));
  });

  it("serves a hashed asset", () => {
    expect(resolveStaticFile(root, "/assets/app-abc123.js")).toBe(
      path.join(root, "assets", "app-abc123.js")
    );
  });

  it("refuses to climb out of the output directory", () => {
    expect(resolveStaticFile(root, "/../guiderails-static-secret")).toBeNull();
    expect(resolveStaticFile(root, "/assets/../../guiderails-static-secret")).toBeNull();
  });

  it("refuses an encoded climb", () => {
    // The decode happens before resolution, so screening the raw URL for ".." would miss this.
    expect(resolveStaticFile(root, "/%2e%2e/guiderails-static-secret")).toBeNull();
  });

  it("refuses a malformed escape rather than throwing", () => {
    expect(resolveStaticFile(root, "/%zz")).toBeNull();
  });

  it("returns null for a path that does not exist", () => {
    expect(resolveStaticFile(root, "/assets/nope.js")).toBeNull();
  });

  it("does not resolve a directory as a file", () => {
    expect(resolveStaticFile(root, "/assets")).toBeNull();
  });
});
