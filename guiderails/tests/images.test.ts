import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { extractGuide } from "../src/extract/index.js";

/**
 * The image linter's whole value is that it does not false-positive. A grep-based checker
 * reports commented-out and fenced-code references as breakage, and docs/ contains both,
 * so these are the cases that decide whether the check is trustworthy enough to gate on.
 */

let root: string;

const write = (relative: string, content: string): string => {
  const full = path.join(root, relative);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
  return full;
};

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "guiderails-images-"));
  write("images/real.png", "not really a png");
  write("guides/nested/local-images/here.png", "not really a png");
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

const extract = (file: string) =>
  extractGuide(file, { repoRoot: root, docsRoot: root, tab: null });

describe("image reference resolution", () => {
  it("resolves an absolute reference against the docs root", () => {
    const file = write("guides/a.mdx", "---\ntitle: A\n---\n\n![ok](/images/real.png)\n");
    const [image] = extract(file).allImages;
    expect(image?.exists).toBe(true);
  });

  it("resolves a relative reference against the containing file", () => {
    const file = write(
      "guides/nested/b.mdx",
      "---\ntitle: B\n---\n\n![ok](./local-images/here.png)\n"
    );
    const [image] = extract(file).allImages;
    expect(image?.exists).toBe(true);
  });

  it("resolves a parent-relative reference", () => {
    const file = write(
      "guides/nested/c.mdx",
      "---\ntitle: C\n---\n\n![ok](../../images/real.png)\n"
    );
    const [image] = extract(file).allImages;
    expect(image?.exists).toBe(true);
  });

  it("reports a genuinely missing file", () => {
    const file = write("guides/d.mdx", "---\ntitle: D\n---\n\n![gone](/images/nope.png)\n");
    const [image] = extract(file).allImages;
    expect(image?.exists).toBe(false);
  });

  it("does NOT fall back to a same-named file elsewhere on disk", () => {
    // Mintlify serves docs/ as the web root, so an absolute reference that misses is
    // broken for a reader even though `here.png` exists under guides/nested/local-images/.
    // A lenient resolver would hide exactly the bug this linter exists to catch.
    const file = write("guides/e.mdx", "---\ntitle: E\n---\n\n![nope](/here.png)\n");
    const [image] = extract(file).allImages;
    expect(image?.exists).toBe(false);
  });

  it("ignores a reference inside a JSX comment", () => {
    const file = write(
      "guides/f.mdx",
      "---\ntitle: F\n---\n\n{/* ![commented](/images/nope.png) */}\n\nSome prose.\n"
    );
    expect(extract(file).allImages).toHaveLength(0);
  });

  it("ignores a reference inside a fenced code block", () => {
    const file = write(
      "guides/g.mdx",
      "---\ntitle: G\n---\n\n```md\n![example](/images/nope.png)\n```\n"
    );
    expect(extract(file).allImages).toHaveLength(0);
  });

  it("finds a reference written as an img element", () => {
    const file = write(
      "guides/h.mdx",
      '---\ntitle: H\n---\n\n<img src="/images/real.png" alt="ok" />\n'
    );
    const [image] = extract(file).allImages;
    expect(image?.exists).toBe(true);
    expect(image?.alt).toBe("ok");
  });

  it("finds a reference wrapped in a Frame", () => {
    const file = write(
      "guides/i.mdx",
      "---\ntitle: I\n---\n\n<Frame>\n  ![framed](/images/real.png)\n</Frame>\n"
    );
    const [image] = extract(file).allImages;
    expect(image?.exists).toBe(true);
  });

  it("treats a remote reference as somebody else's uptime problem", () => {
    const file = write(
      "guides/j.mdx",
      "---\ntitle: J\n---\n\n![remote](https://example.com/a.png)\n"
    );
    const [image] = extract(file).allImages;
    expect(image?.resolved).toBeNull();
    expect(image?.exists).toBe(true);
  });

  it("tolerates a URL fragment", () => {
    const file = write(
      "guides/k.mdx",
      "---\ntitle: K\n---\n\n![themed](/images/real.png#gh-dark-mode-only)\n"
    );
    const [image] = extract(file).allImages;
    expect(image?.exists).toBe(true);
  });
});
