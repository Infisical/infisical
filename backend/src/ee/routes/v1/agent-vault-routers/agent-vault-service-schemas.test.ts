import { describe, expect, test } from "vitest";

import { AgentVaultCreateServiceBodySchema, AgentVaultUpdateServiceBodySchema } from "./agent-vault-schemas";

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
