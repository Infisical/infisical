import { describe, expect, it } from "vitest";

import {
  AGENT_VAULT_EXPANDED_FIELD_MAX_LENGTH,
  AGENT_VAULT_MAX_REFERENCES_PER_FIELD,
  expandStoredVariableReferences,
  findStoredVariableIds,
  findVariableKeys,
  hasMalformedVariableReference,
  hasTooManyVariableReferences,
  isVariableKey,
  toStoredVariableReferences
} from "./agent-vault-variable-fns";

const GITHUB_ID = "0b8c3f4e-3f64-4a0e-9d3b-4f0f6a1c2d11";
const DATADOG_ID = "6f0e2a57-8c1d-4b2f-a9e3-1d2c3b4a5f66";

describe("agent vault variable references", () => {
  describe("keys", () => {
    it.each([["GITHUB_TOKEN"], ["A"], ["A1"], ["DD_API_KEY_2"]])("accepts %s", (key) => {
      expect(isVariableKey(key)).toBe(true);
    });

    it.each([
      ["github_token", "lower case"],
      ["1TOKEN", "leading digit"],
      ["_TOKEN", "leading underscore"],
      ["GITHUB-TOKEN", "dash"],
      ["GITHUB TOKEN", "space"],
      ["", "empty"]
    ])("rejects %s (%s)", (key) => {
      expect(isVariableKey(key)).toBe(false);
    });
  });

  describe("finding references", () => {
    it("finds each key once, in order", () => {
      expect(findVariableKeys("{{A}}:{{B}}-{{A}}")).toEqual(["A", "B"]);
    });

    it("ignores text without braces", () => {
      expect(findVariableKeys("plain-token")).toEqual([]);
      expect(hasMalformedVariableReference("plain-token")).toBe(false);
    });

    it.each([["{{github_token}}"], ["{{ GITHUB_TOKEN }}"], ["{{}}"], ["prefix-{{A}}-{{bad}}"]])(
      "reports %s as malformed",
      (text) => {
        expect(hasMalformedVariableReference(text)).toBe(true);
      }
    );

    it("reads the inner pair of a tripled brace", () => {
      expect(findVariableKeys("{{{A}}}")).toEqual(["A"]);
      expect(hasMalformedVariableReference("{{{A}}}")).toBe(false);
    });

    it("does not count a lone brace pair as a reference", () => {
      expect(hasMalformedVariableReference("{{ no closing")).toBe(false);
      expect(findVariableKeys("no opening }}")).toEqual([]);
    });
  });

  describe("limiting references", () => {
    it("takes up to the limit, counting a repeated reference each time", () => {
      expect(hasTooManyVariableReferences("{{A}}".repeat(AGENT_VAULT_MAX_REFERENCES_PER_FIELD))).toBe(false);
      expect(hasTooManyVariableReferences("{{A}}".repeat(AGENT_VAULT_MAX_REFERENCES_PER_FIELD + 1))).toBe(true);
    });

    it("counts different keys the same way", () => {
      const keys = Array.from({ length: AGENT_VAULT_MAX_REFERENCES_PER_FIELD + 1 }, (_, index) => `{{KEY_${index}}}`);
      expect(hasTooManyVariableReferences(keys.slice(1).join(":"))).toBe(false);
      expect(hasTooManyVariableReferences(keys.join(":"))).toBe(true);
    });
  });

  describe("storing", () => {
    const idOfKey = new Map([
      ["GITHUB_TOKEN", GITHUB_ID],
      ["DD_API_KEY", DATADOG_ID]
    ]);

    it("names each variable by id", () => {
      expect(toStoredVariableReferences("{{GITHUB_TOKEN}}:{{DD_API_KEY}}:{{GITHUB_TOKEN}}", idOfKey)).toBe(
        `{{${GITHUB_ID}}}:{{${DATADOG_ID}}}:{{${GITHUB_ID}}}`
      );
    });

    it("leaves text around a reference alone", () => {
      expect(toStoredVariableReferences("token {{GITHUB_TOKEN}}!", idOfKey)).toBe(`token {{${GITHUB_ID}}}!`);
    });
  });

  describe("finding stored references", () => {
    it("finds each id once and skips anything that is not one", () => {
      expect(
        findStoredVariableIds(`{{${GITHUB_ID}}}:{{GITHUB_TOKEN}}:{{${GITHUB_ID}}}:{{not-a-uuid}}:{{${DATADOG_ID}}}`)
      ).toEqual([GITHUB_ID, DATADOG_ID]);
    });

    it("ignores an upper case uuid, which the database never produces", () => {
      expect(findStoredVariableIds(`{{${GITHUB_ID.toUpperCase()}}}`)).toEqual([]);
    });
  });

  describe("expanding", () => {
    const values: Record<string, string> = { [GITHUB_ID]: "ghp_alpha", [DATADOG_ID]: "dd_beta" };

    it("replaces every stored reference", () => {
      expect(expandStoredVariableReferences(`{{${GITHUB_ID}}}-{{${DATADOG_ID}}}`, (id) => values[id])).toBe(
        "ghp_alpha-dd_beta"
      );
    });

    it("keeps a value saved before variables existed exactly as it was, without looking it up", () => {
      const lookedUp: string[] = [];
      const expanded = expandStoredVariableReferences("{{GITHUB_TOKEN}} and {{lower}}", (id) => {
        lookedUp.push(id);
        return values[id];
      });
      expect(expanded).toBe("{{GITHUB_TOKEN}} and {{lower}}");
      expect(lookedUp).toEqual([]);
    });

    it("leaves a stored id with no variable behind it as text", () => {
      expect(expandStoredVariableReferences(`{{${GITHUB_ID}}}`, () => undefined)).toBe(`{{${GITHUB_ID}}}`);
    });

    it("does not expand braces inside a variable's own value", () => {
      expect(expandStoredVariableReferences(`{{${GITHUB_ID}}}`, () => `{{${DATADOG_ID}}}`)).toBe(`{{${DATADOG_ID}}}`);
    });

    it("inserts a value holding a replacement pattern literally", () => {
      expect(expandStoredVariableReferences(`{{${GITHUB_ID}}}`, () => "a$&b$1")).toBe("a$&b$1");
    });

    it("round-trips what the API accepted", () => {
      const idOfKey = new Map([["GITHUB_TOKEN", GITHUB_ID]]);
      const stored = toStoredVariableReferences("Bearer {{GITHUB_TOKEN}}", idOfKey);
      expect(expandStoredVariableReferences(stored, (id) => values[id])).toBe("Bearer ghp_alpha");
    });

    it("fills in up to the length cap, counting the text around the references", () => {
      const value = "v".repeat(AGENT_VAULT_EXPANDED_FIELD_MAX_LENGTH - 1);
      expect(expandStoredVariableReferences(`x{{${GITHUB_ID}}}`, () => value)).toBe(`x${value}`);
      expect(expandStoredVariableReferences(`xy{{${GITHUB_ID}}}`, () => value)).toBeUndefined();
    });

    it("gives up on a field that short references would fill to millions of characters", () => {
      const idOfKey = new Map([["A", GITHUB_ID]]);
      const stored = toStoredVariableReferences("{{A}}".repeat(1638), idOfKey);
      expect(expandStoredVariableReferences(stored, () => "v".repeat(8192))).toBeUndefined();
    });

    it("measures a field by its filled-in length, not its stored one", () => {
      const idOfKey = new Map([["A", GITHUB_ID]]);
      const stored = toStoredVariableReferences("{{A}}".repeat(1638), idOfKey);
      expect(stored.length).toBeGreaterThan(AGENT_VAULT_EXPANDED_FIELD_MAX_LENGTH);
      expect(expandStoredVariableReferences(stored, () => "a")).toBe("a".repeat(1638));
    });
  });
});
