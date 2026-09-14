import { describe, expect, it } from "vitest";

import { agentVaultPathPrefixListSchema, matchesPathPrefix, normalizePathPrefix } from "./agent-vault-path-prefix";

describe("agent vault path prefixes", () => {
  describe("grammar", () => {
    it.each([["/repos"], ["/repos/octo"], ["/"], ["/v1/chat/completions"], ["/repos-and-more"]])(
      "accepts %s",
      (prefix) => {
        expect(agentVaultPathPrefixListSchema.safeParse([prefix]).success).toBe(true);
      }
    );

    it.each([
      ["repos", "must start with a /"],
      ["/repos/../admin", ".. segment"],
      ["/repos/./x", ". segment"],
      ["//repos", "empty segment"],
      ["/repos%2fadmin", "% is rejected so the byte comparison stays exact"],
      ["/repos;x", "; is stripped by some servers"],
      ["/repos\\x", "\\ is read as / by some servers"],
      ["/repos?x=1", "? ends the path"],
      ["/repos#x", "# ends the path"],
      ["/repos x", "a space would have to be escaped"]
    ])("rejects %s (%s)", (prefix) => {
      expect(agentVaultPathPrefixListSchema.safeParse([prefix]).success).toBe(false);
    });

    it("rejects an empty list, because NULL is how every path is expressed", () => {
      expect(agentVaultPathPrefixListSchema.safeParse([]).success).toBe(false);
    });

    it("accepts null", () => {
      expect(agentVaultPathPrefixListSchema.safeParse(null).success).toBe(true);
    });

    it("rejects duplicates once normalised", () => {
      expect(agentVaultPathPrefixListSchema.safeParse(["/repos", "/repos/"]).success).toBe(false);
    });

    it("caps the list", () => {
      const many = Array.from({ length: 21 }, (_, i) => `/p${i}`);
      expect(agentVaultPathPrefixListSchema.safeParse(many).success).toBe(false);
    });
  });

  describe("normalisation", () => {
    it("strips a trailing slash so /repos and /repos/ are one prefix", () => {
      expect(normalizePathPrefix("/repos/")).toBe("/repos");
    });

    it("leaves a bare / alone, since stripping it would empty the prefix", () => {
      expect(normalizePathPrefix("/")).toBe("/");
    });
  });

  describe("matching", () => {
    it.each([
      ["/repos", "/repos"],
      ["/repos", "/repos/"],
      ["/repos", "/repos/octo/hello"],
      ["/", "/anything/at/all"]
    ])("prefix %s matches %s", (prefix, path) => {
      expect(matchesPathPrefix(prefix, path)).toBe(true);
    });

    it.each([
      ["/repos", "/repositories"],
      ["/repos", "/repo"],
      ["/repos", "/admin"],
      ["/repos/octo", "/repos/octopus"]
    ])("prefix %s does not match %s", (prefix, path) => {
      expect(matchesPathPrefix(prefix, path)).toBe(false);
    });
  });
});
