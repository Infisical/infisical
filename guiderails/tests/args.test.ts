import { describe, expect, it } from "vitest";

import { parseArgs } from "../src/args.js";
import { REPO_ROOT, resolveGuidePath } from "../src/paths.js";
import { resolveRegistryTargets } from "../src/registry.js";

const SPEC = {
  valueFlags: ["--changed-files", "--diff"],
  booleanFlags: ["--screenshots", "--live", "--headed", "--force-agent"]
};

describe("parseArgs", () => {
  it("keeps a positional that follows a boolean flag", () => {
    // The bug this replaces: the old filter assumed anything after a `--flag` was that flag's
    // value, so `run --live folder` dropped `folder` and silently walked the whole registry.
    expect(parseArgs(["--live", "folder"], SPEC).positionals).toEqual(["folder"]);
  });

  it("does not treat a value-flag's value as a positional", () => {
    const args = parseArgs(["--diff", "/tmp/d.diff", "folder"], SPEC);
    expect(args.positionals).toEqual(["folder"]);
    expect(args.value("--diff")).toBe("/tmp/d.diff");
  });

  it("is order-independent", () => {
    const forms = [
      ["folder", "--live", "--diff", "/tmp/d"],
      ["--live", "folder", "--diff", "/tmp/d"],
      ["--diff", "/tmp/d", "--live", "folder"],
      ["--live", "--diff", "/tmp/d", "folder"]
    ];
    for (const form of forms) {
      const args = parseArgs(form, SPEC);
      expect(args.positionals, form.join(" ")).toEqual(["folder"]);
      expect(args.has("--live"), form.join(" ")).toBe(true);
      expect(args.value("--diff"), form.join(" ")).toBe("/tmp/d");
    }
  });

  it("accepts the equals form", () => {
    expect(parseArgs(["--diff=/tmp/d", "folder"], SPEC).value("--diff")).toBe("/tmp/d");
  });

  it("takes several positionals", () => {
    expect(parseArgs(["folder", "secret-sharing", "--live"], SPEC).positionals).toEqual([
      "folder",
      "secret-sharing"
    ]);
  });

  it("reports a flag the command does not know about", () => {
    // Better than ignoring it: a typo like --screenshot would otherwise silently do nothing.
    expect(parseArgs(["--screenshot"], SPEC).unknown).toEqual(["--screenshot"]);
  });

  it("leaves a value flag null when nothing follows it", () => {
    const args = parseArgs(["--diff"], SPEC);
    expect(args.value("--diff")).toBeNull();
    expect(args.positionals).toEqual([]);
  });

  it("does not swallow a following flag as a value", () => {
    const args = parseArgs(["--diff", "--live", "folder"], SPEC);
    expect(args.value("--diff")).toBeNull();
    expect(args.has("--live")).toBe(true);
    expect(args.positionals).toEqual(["folder"]);
  });

  it("reports an absent boolean as false", () => {
    expect(parseArgs(["folder"], SPEC).has("--live")).toBe(false);
  });
});

describe("resolveRegistryTargets", () => {
  it("returns the whole registry when nothing is named", () => {
    expect(resolveRegistryTargets([]).length).toBeGreaterThan(1);
  });

  it("matches a guide by a short substring", () => {
    expect(resolveRegistryTargets(["folder"]).map((e) => e.guide)).toEqual([
      "docs/documentation/platform/folder.mdx"
    ]);
  });

  it("matches a full repo-relative path", () => {
    expect(
      resolveRegistryTargets(["docs/documentation/platform/folder.mdx"]).map((e) => e.guide)
    ).toEqual(["docs/documentation/platform/folder.mdx"]);
  });

  it("resolves several names at once", () => {
    expect(resolveRegistryTargets(["folder", "secret-sharing"]).length).toBe(2);
  });

  it("refuses an ambiguous name rather than guessing", () => {
    // `privilege` matches both additional-privileges and assume-privilege. Walking the wrong
    // guide silently is worse than refusing.
    expect(() => resolveRegistryTargets(["privilege"])).toThrow(/matches more than one/);
  });

  it("prefers an exact path over a substring match", () => {
    // An exact guide path must win even when it is also a substring of nothing else.
    const entry = resolveRegistryTargets([
      "docs/documentation/platform/access-controls/assume-privilege.mdx"
    ]);
    expect(entry[0]?.guide).toBe(
      "docs/documentation/platform/access-controls/assume-privilege.mdx"
    );
  });

  it("lists what is available when a name is unknown", () => {
    expect(() => resolveRegistryTargets(["nope"])).toThrow(/is not a registered guide/);
  });
});

describe("resolveGuidePath", () => {
  const rel = (absolute: string): string => absolute.replace(`${REPO_ROOT}/`, "");

  it("accepts a docs-relative path", () => {
    expect(rel(resolveGuidePath("documentation/platform/folder.mdx"))).toBe(
      "docs/documentation/platform/folder.mdx"
    );
  });

  it("accepts a repo-relative path", () => {
    expect(rel(resolveGuidePath("docs/documentation/platform/folder.mdx"))).toBe(
      "docs/documentation/platform/folder.mdx"
    );
  });

  it("accepts a path without the extension", () => {
    expect(rel(resolveGuidePath("documentation/platform/folder"))).toBe(
      "docs/documentation/platform/folder.mdx"
    );
  });

  it("resolves a bare name via a filename match", () => {
    // `folder` also appears in folder-structure.mdx and pam/folders/overview.mdx, so naming the
    // page exactly has to beat merely appearing in another page's path.
    expect(rel(resolveGuidePath("folder"))).toBe("docs/documentation/platform/folder.mdx");
  });

  it("refuses a name that is genuinely ambiguous", () => {
    // Dozens of pages are called overview.mdx, so there is no right answer to guess at.
    expect(() => resolveGuidePath("overview")).toThrow(/matches \d+ guides/);
  });

  it("explains both attempts when nothing matches", () => {
    expect(() => resolveGuidePath("no-such-page-anywhere")).toThrow(/No guide found/);
  });

  it("does not resolve a directory as a guide", () => {
    // `documentation/platform` exists as a directory; treating it as a file would fail later
    // with a confusing read error instead of here with a clear one.
    expect(() => resolveGuidePath("documentation/platform")).toThrow();
  });
});
