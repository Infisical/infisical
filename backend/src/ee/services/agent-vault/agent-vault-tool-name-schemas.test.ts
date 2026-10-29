import { describe, expect, it } from "vitest";

import { AGENT_VAULT_MAX_ALLOWED_TOOLS, agentVaultAllowedToolsSchema } from "./agent-vault-tool-name-schemas";

describe("agent vault allowed tools", () => {
  it.each([
    ["read_file"],
    ["github.create_issue"],
    ["ns:tool/v2-beta"],
    ["query+sum"],
    ["read file"],
    ["a".repeat(128)]
  ])("accepts %s", (name) => {
    expect(agentVaultAllowedToolsSchema.parse([name])).toEqual([name]);
  });

  it.each([
    ["", "can't be empty"],
    [" read_file", "start or end with a space"],
    ["read_file\t", "start or end with a space"],
    ["read\u0000file", "control characters"],
    ["a".repeat(129), "longer than 128"]
  ])("refuses %j", (name, message) => {
    const result = agentVaultAllowedToolsSchema.safeParse([name]);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toContain(message);
  });

  it("keeps null as every tool and refuses an empty list", () => {
    expect(agentVaultAllowedToolsSchema.parse(null)).toBeNull();
    expect(agentVaultAllowedToolsSchema.safeParse([]).success).toBe(false);
  });

  it("refuses duplicates but not names differing only by case", () => {
    expect(agentVaultAllowedToolsSchema.safeParse(["read", "read"]).error?.issues[0].message).toBe(
      '"read" is listed twice.'
    );
    expect(agentVaultAllowedToolsSchema.parse(["read", "Read"])).toEqual(["read", "Read"]);
  });

  it("caps the count", () => {
    const names = Array.from({ length: AGENT_VAULT_MAX_ALLOWED_TOOLS + 1 }, (_, index) => `tool_${index}`);
    expect(agentVaultAllowedToolsSchema.safeParse(names).success).toBe(false);
    expect(agentVaultAllowedToolsSchema.safeParse(names.slice(1)).success).toBe(true);
  });
});
