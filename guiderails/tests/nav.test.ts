import { describe, expect, it } from "vitest";

import { extractNavPaths, isNavPath } from "../src/extract/nav.js";
import type { InlineToken } from "../src/extract/nav.js";

const bold = (text: string): InlineToken => ({ bold: true, text });
const plain = (text: string): InlineToken => ({ bold: false, text });

describe("nav path normalization", () => {
  it("splits an arrow inside a single bold span", () => {
    expect(extractNavPaths([plain("Go to "), bold("Settings → Folders")])).toEqual([
      ["Settings", "Folders"]
    ]);
  });

  it("splits a gt inside a single bold span", () => {
    expect(extractNavPaths([bold("Project > Key Management")])).toEqual([
      ["Project", "Key Management"]
    ]);
  });

  it("merges separate bold spans joined by a gt", () => {
    expect(
      extractNavPaths([bold("Project"), plain(" > "), bold("Integrations")])
    ).toEqual([["Project", "Integrations"]]);
  });

  it("merges separate bold spans joined by an arrow", () => {
    expect(
      extractNavPaths([bold("Organization Settings"), plain(" → "), bold("Products")])
    ).toEqual([["Organization Settings", "Products"]]);
  });

  it("merges separate bold spans joined by an ASCII arrow", () => {
    expect(extractNavPaths([bold("A"), plain(" -> "), bold("B")])).toEqual([["A", "B"]]);
  });

  it("finds a fully unbolded breadcrumb in running text", () => {
    const tokens = [
      plain("head to your Organization Settings > Access Control > Groups and press "),
      bold("Create group")
    ];
    expect(extractNavPaths(tokens)).toEqual([
      ["Organization Settings", "Access Control", "Groups"]
    ]);
  });

  it("does not merge bold spans separated by prose", () => {
    const tokens = [bold("Save"), plain(" and then click "), bold("Confirm")];
    expect(extractNavPaths(tokens)).toEqual([]);
  });

  it("treats a single-segment bold span as a click target, not a breadcrumb", () => {
    expect(extractNavPaths([bold("Add Policies")])).toEqual([]);
    expect(isNavPath("Add Policies")).toBe(false);
    expect(isNavPath("Settings → Folders")).toBe(true);
  });

  it("strips trailing punctuation from segments", () => {
    expect(extractNavPaths([bold("Project > Integrations.")])).toEqual([
      ["Project", "Integrations"]
    ]);
  });

  it("ignores shell redirects and comparisons in prose", () => {
    // The unbolded-path matcher requires capitalized, label-shaped segments precisely so
    // that ordinary prose and code-ish text do not register as navigation.
    expect(extractNavPaths([plain("run cat file > out.txt to save it")])).toEqual([]);
    expect(extractNavPaths([plain("when count > threshold the job retries")])).toEqual([]);
  });

  it("deduplicates repeated breadcrumbs", () => {
    const tokens = [
      bold("Project → Settings"),
      plain(" then later "),
      bold("Project → Settings")
    ];
    expect(extractNavPaths(tokens)).toEqual([["Project", "Settings"]]);
  });
});
