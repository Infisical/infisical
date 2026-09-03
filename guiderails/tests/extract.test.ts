import { describe, expect, it } from "vitest";

import { extractGuide } from "../src/extract/index.js";
import { DOCS_ROOT, REPO_ROOT, resolveGuidePath } from "../src/paths.js";
import type { GuideDoc } from "../src/types.js";

const extract = (guide: string, tab?: string | null): GuideDoc =>
  extractGuide(resolveGuidePath(guide), {
    repoRoot: REPO_ROOT,
    docsRoot: DOCS_ROOT,
    tab: tab ?? null
  });

describe("additional-privileges.mdx (the canonical Steps form)", () => {
  const doc = extract("documentation/platform/access-controls/additional-privileges.mdx");

  it("extracts a single seven-step procedure from the Infisical UI tab", () => {
    expect(doc.procedures).toHaveLength(1);
    const [procedure] = doc.procedures;
    expect(procedure?.kind).toBe("steps");
    expect(procedure?.steps).toHaveLength(7);
    expect(procedure?.heading).toBe("Adding Additional Privileges");
  });

  it("reports the unwalked API tab as unverified rather than dropping it", () => {
    expect(doc.availableTabs).toEqual(["Infisical UI", "API"]);
    expect(doc.tab).toBe("Infisical UI");
    expect(doc.unverified.some((region) => region.tab === "API")).toBe(true);
  });

  it("picks up bold click targets", () => {
    const targets = doc.procedures[0]?.steps.flatMap((step) => step.boldTargets) ?? [];
    expect(targets).toContain("Add Additional Privileges");
    expect(targets).toContain("Add Policies");
    expect(targets).toContain("Save");
  });

  it("reads em-dash field bullets as fields, not as click targets", () => {
    const step = doc.procedures[0]?.steps.find((s) => s.title === "Configure the privilege");
    expect(step?.fields.map((field) => field.label)).toEqual([
      "Privilege Name",
      "Duration",
      "Policies"
    ]);
    expect(step?.boldTargets).not.toContain("Privilege Name");
  });

  it("resolves every screenshot", () => {
    expect(doc.allImages).toHaveLength(7);
    expect(doc.allImages.every((image) => image.exists)).toBe(true);
  });

  it("attaches each screenshot to the step that carries it", () => {
    // Regression: a markdown image is an `image` node nested inside a `paragraph`, so a
    // top-level-only scan of the step body found none. Every step reported zero screenshots
    // while the document-level count stayed correct, which silently disabled the entire
    // screenshot-comparison path.
    const perStep = doc.procedures[0]?.steps.map((step) => step.images.length) ?? [];
    expect(perStep).toEqual([1, 1, 1, 1, 1, 1, 1]);
    const stepImages = doc.procedures[0]?.steps.flatMap((step) => step.images) ?? [];
    expect(stepImages.every((image) => image.exists)).toBe(true);
  });

  it("can be pointed at the other tab explicitly", () => {
    const api = extract(
      "documentation/platform/access-controls/additional-privileges.mdx",
      "API"
    );
    expect(api.tab).toBe("API");
    expect(api.unverified.some((region) => region.tab === "Infisical UI")).toBe(true);
  });
});

describe("folder.mdx (prose fallback)", () => {
  const doc = extract("documentation/platform/folder.mdx");

  it("splits running prose into one procedure per heading", () => {
    expect(doc.procedures.map((procedure) => procedure.heading)).toEqual([
      "Managing folders",
      "Comparing folders",
      "Replicating Folder Contents"
    ]);
    expect(doc.procedures.every((procedure) => procedure.kind === "prose")).toBe(true);
  });

  it("still finds click targets in unstructured prose", () => {
    const targets = doc.procedures[0]?.steps.flatMap((step) => step.boldTargets) ?? [];
    expect(targets).toContain("Add Folder");
  });

  it("resolves relative image references", () => {
    // folder.mdx writes ../../images/... rather than an absolute /images/... path.
    expect(doc.allImages.length).toBeGreaterThan(0);
    expect(doc.allImages.every((image) => image.exists)).toBe(true);
    expect(doc.allImages.some((image) => image.raw.startsWith("../"))).toBe(true);
  });
});

describe("secret-sharing.mdx (two procedures in one file)", () => {
  const doc = extract("documentation/platform/secret-sharing.mdx");

  it("keeps the two Steps blocks as separate procedures", () => {
    expect(doc.procedures).toHaveLength(2);
    expect(doc.procedures.map((procedure) => procedure.heading)).toEqual([
      "Sharing a Secret",
      "Requesting a Secret"
    ]);
  });

  it("reads colon-inside-bold bullets as fields with the colon stripped", () => {
    const step = doc.procedures[0]?.steps.find((s) => s.title === "Configure Secret Share");
    const labels = step?.fields.map((field) => field.label) ?? [];
    expect(labels).toContain("Max Views");
    expect(labels).toContain("Your Secret");
    expect(labels.some((label) => label.endsWith(":"))).toBe(false);
  });

  it("carries the instruction when the step body is only a screenshot", () => {
    // Several steps here put the entire instruction in the title attribute.
    const titles = doc.procedures.flatMap((procedure) =>
      procedure.steps.map((step) => step.title)
    );
    expect(titles).toContain("Access Shared Secret");
    expect(doc.procedures[0]?.steps.every((step) => step.prose.length > 0)).toBe(true);
  });
});

describe("deliver-first-secret.mdx (recursive snippet inlining)", () => {
  const doc = extract(
    "documentation/platform/secrets-mgmt/quick-starts/deliver-first-secret.mdx"
  );

  it("expands an imported snippet into real steps", () => {
    const totalSteps = doc.procedures.reduce(
      (sum, procedure) => sum + procedure.steps.length,
      0
    );
    // The page itself declares two Step elements; the snippet expands it well past that.
    expect(totalSteps).toBeGreaterThan(5);
  });

  it("attributes inlined steps to the snippet file, not the importing page", () => {
    const fromSnippet = doc.procedures
      .flatMap((procedure) => procedure.steps)
      .filter((step) => step.file.includes("/snippets/"));

    expect(fromSnippet.length).toBeGreaterThan(0);
    // Line numbers must be the snippet's own, so a suggestion lands in the snippet rather
    // than at a meaningless offset in every page that imports it.
    expect(fromSnippet.every((step) => step.line > 0)).toBe(true);
  });
});

describe("content hashing", () => {
  it("is stable across repeated extraction", () => {
    const a = extract("documentation/platform/access-controls/additional-privileges.mdx");
    const b = extract("documentation/platform/access-controls/additional-privileges.mdx");
    expect(a.contentHash).toBe(b.contentHash);
  });

  it("differs between guides", () => {
    const a = extract("documentation/platform/access-controls/additional-privileges.mdx");
    const b = extract("documentation/platform/folder.mdx");
    expect(a.contentHash).not.toBe(b.contentHash);
  });

  it("differs between tabs of the same guide", () => {
    const ui = extract("documentation/platform/access-controls/additional-privileges.mdx");
    const api = extract(
      "documentation/platform/access-controls/additional-privileges.mdx",
      "API"
    );
    expect(ui.contentHash).not.toBe(api.contentHash);
  });
});
