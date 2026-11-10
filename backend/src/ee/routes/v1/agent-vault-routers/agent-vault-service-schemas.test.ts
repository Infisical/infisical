import { describe, expect, test } from "vitest";

import { AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE } from "@app/ee/services/agent-vault/agent-vault-credential-schemas";

import {
  AGENT_VAULT_SERVICE_DESCRIPTION_MESSAGE,
  AgentVaultCreateServiceBodySchema,
  AgentVaultUpdateServiceBodySchema
} from "./agent-vault-schemas";

const postgres = (extra: Record<string, unknown> = {}) => ({
  type: "postgres",
  name: "analytics",
  host: "db.internal",
  database: "app",
  credential: { type: "basic", username: "agent", password: "p" },
  ...extra
});

const messagesOf =
  (schema: typeof AgentVaultCreateServiceBodySchema | typeof AgentVaultUpdateServiceBodySchema) => (input: unknown) => {
    const result = schema.safeParse(input);
    return result.success ? [] : result.error.issues.map((issue) => issue.message);
  };

const createMessages = messagesOf(AgentVaultCreateServiceBodySchema);
const updateMessages = messagesOf(AgentVaultUpdateServiceBodySchema);

describe("database and SSH service request schemas", () => {
  test.each([
    [{ host: "" }, "Enter the server's host name or IP address."],
    [{ host: "a".repeat(254) }, "The host can be at most 253 characters."],
    [{ port: 0 }, "The port must be between 1 and 65535."],
    [{ port: 1.5 }, "The port must be a whole number."],
    [{ database: "" }, "Enter the database to connect to."],
    [{ database: "a".repeat(65) }, "The database name can be at most 64 characters."]
  ])("refuse %o with the same message the service uses", (extra, message) => {
    expect(createMessages(postgres(extra))).toEqual([message]);
  });

  test("an SSH key left to members gets only the service's refusal, not one about the username", () => {
    expect(
      createMessages({
        type: "ssh",
        name: "bastion",
        host: "bastion.internal",
        credential: {
          type: "ssh-key",
          username: "agent",
          privateKey: "key",
          memberProvidedFields: ["credential-username"]
        }
      })
    ).toEqual([]);
  });

  test("an update to a database service can't send a null database or TLS", () => {
    expect(updateMessages({ type: "postgres", database: null })).toEqual([
      "A PostgreSQL service always has a database. Send its name, or leave 'database' out to keep it."
    ]);
    expect(updateMessages({ type: "mysql", tls: null })).toEqual([
      "Send the TLS settings to change, or leave 'tls' out to keep them. To turn TLS off, send 'tls': { 'enabled': false }."
    ]);
  });

  test("an update to an SSH service takes back the null database and TLS it reads", () => {
    expect(updateMessages({ type: "ssh", port: 2222, database: null, tls: null })).toEqual([]);
  });

  test.each([
    ["", undefined],
    ["   ", undefined],
    [null, null]
  ])("an SSH key update reads the certificate %j as %j", (certificate, expected) => {
    const parsed = AgentVaultUpdateServiceBodySchema.parse({
      type: "ssh",
      credential: { type: "ssh-key", certificate }
    }) as { credential: { certificate?: string | null } };
    expect(parsed.credential.certificate).toBe(expected);
  });
});

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

  test("database and SSH services take one too", () => {
    expect(AgentVaultCreateServiceBodySchema.parse(postgres({ description: "Read-only analytics" })).description).toBe(
      "Read-only analytics"
    );
    expect(AgentVaultUpdateServiceBodySchema.parse({ type: "ssh", description: null }).description).toBeNull();
  });
});
