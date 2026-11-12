import { describe, expect, test } from "vitest";

import { AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE } from "@app/ee/services/agent-vault/agent-vault-credential-schemas";

import {
  AGENT_VAULT_SERVICE_DESCRIPTION_MESSAGE,
  AgentVaultCreateServiceBodySchema,
  AgentVaultUpdateServiceBodySchema
} from "./agent-vault-schemas";

const httpService = (extra: Record<string, unknown> = {}) => ({
  type: "http",
  name: "datadog",
  hostPattern: "api.datadoghq.com",
  credential: { type: "passthrough" },
  ...extra
});

const mcpService = (extra: Record<string, unknown> = {}) => ({
  type: "mcp",
  name: "linear",
  serverUrl: "https://mcp.linear.app/mcp",
  transport: "streamable-http",
  credential: { type: "bearer", value: "lin_api_token" },
  ...extra
});

const createIssues = (body: unknown) => {
  const result = AgentVaultCreateServiceBodySchema.safeParse(body);
  return result.success ? [] : result.error.issues;
};

describe("service description", () => {
  test("is optional on create for both service types, trimmed, and a blank one is none", () => {
    const descriptionOf = (body: unknown) => AgentVaultCreateServiceBodySchema.parse(body).description;
    expect(descriptionOf(httpService({ description: "  Read metrics for the US5 site  " }))).toBe(
      "Read metrics for the US5 site"
    );
    expect(descriptionOf(mcpService({ description: "Issues for the platform team" }))).toBe(
      "Issues for the platform team"
    );
    expect(descriptionOf(mcpService({ description: "   " }))).toBeNull();
    expect(descriptionOf(httpService())).toBeUndefined();
  });

  test("refuses one that is too long, breaks a line, or hides characters", () => {
    expect(createIssues(httpService({ description: "x".repeat(257) }))).toEqual([
      expect.objectContaining({ path: ["description"], message: "A description can be at most 256 characters" })
    ]);
    // Refused once, by the rule every Agent Vault description shares.
    expect(createIssues(httpService({ description: "line\nbreak" }))).toEqual([
      expect.objectContaining({ path: ["description"], message: AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE })
    ]);
    ["zero\u{200B}width", "text\u{202E}direction", "hidden\u{E0041}tag"].forEach((description) =>
      expect(createIssues(mcpService({ description }))).toEqual([
        expect.objectContaining({ path: ["description"], message: AGENT_VAULT_SERVICE_DESCRIPTION_MESSAGE })
      ])
    );
  });

  test("keeps a zero-width joiner, which emoji and several scripts need", () => {
    expect(createIssues(httpService({ description: "Paged on call \u{1F469}\u{200D}\u{1F4BB}" }))).toEqual([]);
  });

  test("on update, null or a blank one removes it, and it is an update on its own", () => {
    const update = (body: unknown) => AgentVaultUpdateServiceBodySchema.parse(body).description;
    expect(update({ type: "http", description: null })).toBeNull();
    expect(update({ type: "mcp", description: "" })).toBeNull();
    expect(update({ type: "mcp", description: "Docs search" })).toBe("Docs search");
    expect(AgentVaultUpdateServiceBodySchema.safeParse({ type: "http" }).success).toBe(false);
  });
});
