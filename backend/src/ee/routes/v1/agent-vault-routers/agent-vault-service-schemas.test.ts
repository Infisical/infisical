import { describe, expect, test } from "vitest";

import { toInlineServiceSummary } from "@app/ee/services/agent-vault-session/agent-vault-session-inline-service-fns";
import { AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE } from "@app/ee/services/agent-vault/agent-vault-credential-schemas";
import {
  AgentVaultCredentialType,
  AgentVaultMcpTransport,
  AgentVaultServiceType
} from "@app/ee/services/agent-vault/agent-vault-enums";
import { toServiceTypeFields } from "@app/ee/services/agent-vault/agent-vault-service-type-fns";

import {
  AGENT_VAULT_SERVICE_DESCRIPTION_MESSAGE,
  AgentVaultCreateServiceBodySchema,
  AgentVaultInlineServiceSchema,
  AgentVaultServiceSchema,
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

const TLS = { enabled: true, verify: true, ca: undefined };

// What each type keeps, stored as it is in a row, with every other type's columns set the way the database leaves them.
const STORED_TYPES = [
  {
    type: AgentVaultServiceType.Http,
    config: {},
    hostPattern: "api.example.com",
    allowedMethods: ["GET"],
    allowedPathPrefixes: ["/v1"],
    fields: ["hostPattern", "allowedMethods", "allowedPathPrefixes"]
  },
  {
    type: AgentVaultServiceType.Mcp,
    config: { serverUrl: "https://mcp.example.com/mcp", transport: AgentVaultMcpTransport.StreamableHttp },
    hostPattern: "mcp.example.com",
    allowedMethods: null,
    allowedPathPrefixes: null,
    fields: ["serverUrl", "transport", "hostPattern"]
  },
  {
    type: AgentVaultServiceType.Postgres,
    config: { host: "db.internal", port: 5432, database: "app", tls: TLS },
    hostPattern: null,
    allowedMethods: null,
    allowedPathPrefixes: null,
    fields: ["host", "port", "database", "tls"]
  },
  {
    type: AgentVaultServiceType.Mysql,
    config: { host: "db.internal", port: 3306, database: "app", tls: TLS },
    hostPattern: null,
    allowedMethods: null,
    allowedPathPrefixes: null,
    fields: ["host", "port", "database", "tls"]
  },
  {
    type: AgentVaultServiceType.Ssh,
    config: { host: "bastion.internal", port: 22 },
    hostPattern: null,
    allowedMethods: null,
    allowedPathPrefixes: null,
    fields: ["host", "port"]
  }
];

const keysOf = (value: unknown) => Object.keys(value as object).sort();

describe("service responses", () => {
  test.each(STORED_TYPES)("a bundle $type service carries only its own fields", ({ fields, ...row }) => {
    const parsed = AgentVaultServiceSchema.parse({
      id: "00000000-0000-4000-8000-000000000001",
      accessBundleId: "00000000-0000-4000-8000-000000000002",
      name: "service",
      description: null,
      ...toServiceTypeFields(row),
      ...(row.type === AgentVaultServiceType.Mcp ? { allowedTools: null } : {}),
      credential: { type: AgentVaultCredentialType.Passthrough },
      customHeaders: [],
      substitutions: [],
      variableReferences: [],
      createdAt: new Date(),
      updatedAt: new Date()
    });
    expect(keysOf(parsed)).toEqual(
      [
        "id",
        "accessBundleId",
        "name",
        "description",
        "type",
        ...fields,
        ...(row.type === AgentVaultServiceType.Mcp ? ["allowedTools"] : []),
        "credential",
        "customHeaders",
        "substitutions",
        "variableReferences",
        "createdAt",
        "updatedAt"
      ].sort()
    );
  });

  test.each(STORED_TYPES)("a session's own $type service carries only its own fields", ({ fields, ...row }) => {
    const parsed = AgentVaultInlineServiceSchema.parse(
      toInlineServiceSummary({
        ...row,
        id: "00000000-0000-4000-8000-000000000001",
        sessionId: "session-1",
        position: 0,
        name: "service",
        credentialType: AgentVaultCredentialType.Passthrough,
        credentialConfig: { type: AgentVaultCredentialType.Passthrough },
        customHeaders: [],
        substitutions: [],
        createdAt: new Date(),
        updatedAt: new Date()
      })
    );
    expect(keysOf(parsed)).toEqual(
      ["id", "name", "description", "type", ...fields, "credential", "customHeaders", "substitutions"].sort()
    );
  });

  test("another type's fields are left off the wire", () => {
    const parsed = AgentVaultInlineServiceSchema.parse({
      id: "00000000-0000-4000-8000-000000000001",
      name: "bastion",
      description: null,
      type: AgentVaultServiceType.Ssh,
      host: "bastion.internal",
      port: 22,
      hostPattern: null,
      serverUrl: null,
      database: null,
      tls: null,
      allowedMethods: null,
      credential: { type: AgentVaultCredentialType.Passthrough },
      customHeaders: [],
      substitutions: []
    });
    expect(parsed).not.toHaveProperty("hostPattern");
    expect(parsed).not.toHaveProperty("database");
    expect(parsed).not.toHaveProperty("allowedMethods");
  });
});
