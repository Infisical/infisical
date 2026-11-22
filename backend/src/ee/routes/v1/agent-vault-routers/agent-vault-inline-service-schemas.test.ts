import { describe, expect, test } from "vitest";

import { prepareInlineServices } from "@app/ee/services/agent-vault-session/agent-vault-session-inline-service-fns";
import { TAgentVaultInlineServiceInput } from "@app/ee/services/agent-vault-session/agent-vault-session-types";
import { AGENT_VAULT_INLINE_SERVICE_VARIABLE_MESSAGE } from "@app/ee/services/agent-vault/agent-vault-variable-fns";
import { BadRequestError } from "@app/lib/errors";

import { AGENT_VAULT_SERVICE_DESCRIPTION_MESSAGE, AgentVaultSessionServicesInputSchema } from "./agent-vault-schemas";

const bearer = (value: string, extra: Record<string, unknown> = {}) => ({
  type: "http",
  hostPattern: "api.example.com",
  credential: { type: "bearer", value },
  ...extra
});

const issuesOf = (input: unknown) => {
  const result = AgentVaultSessionServicesInputSchema.safeParse(input);
  return result.success ? [] : result.error.issues;
};

describe("a session's services request schema", () => {
  test("takes project services by name beside inline ones, in the order sent", () => {
    const parsed = AgentVaultSessionServicesInputSchema.parse(["github", bearer("one", { name: "scratch" }), "linear"]);
    expect(parsed.map((entry) => (typeof entry === "string" ? entry : entry.name))).toEqual([
      "github",
      "scratch",
      "linear"
    ]);
  });

  test("refuses a name used twice, whether listed by name or sent inline, at the second one", () => {
    expect(issuesOf(["github", "github"])).toEqual([
      expect.objectContaining({
        path: [1],
        message:
          'More than one service in this session is named "github". Give each a different name, or leave one out.'
      })
    ]);
    expect(issuesOf(["github", bearer("one", { name: "github" })])[0].path).toEqual([1, "name"]);
  });

  test("caps the services a session lists by name at 50", () => {
    const names = Array.from({ length: 51 }, (_, index) => `service-${index}`);
    expect(issuesOf(names)[0]).toMatchObject({
      code: "custom",
      message: "A session can have at most 50 of the project's services."
    });
    expect(issuesOf(names.slice(0, 50))).toEqual([]);
  });

  test("refuses a list longer than both caps together before parsing its entries", () => {
    const issues = issuesOf(Array.from({ length: 71 }, () => "Not A Slug"));
    expect(issues).toEqual([
      expect.objectContaining({
        message: "A session can carry at most 50 of the project's services and 20 inline services."
      })
    ]);
  });

  test("checks a name like any slug, and an inline service field by field beside names", () => {
    expect(issuesOf(["Not A Slug"])[0].path).toEqual([0]);
    const [issue] = issuesOf([
      "github",
      { type: "http", hostPattern: "api.example.com", credential: { type: "basic" } }
    ]);
    expect(issue.path).toEqual([1, "credential", "username"]);
    expect(issue.message).toBe("A basic credential needs a username, a password, or both");
  });
});

describe("inline services request schema", () => {
  test("refuses a variable reference, well formed or not, and names the field without quoting it", () => {
    const [wellFormed] = issuesOf([bearer("Bearer {{GITHUB_TOKEN}}")]);
    expect(wellFormed.message).toBe(AGENT_VAULT_INLINE_SERVICE_VARIABLE_MESSAGE);
    expect(wellFormed.path).toEqual([0, "credential", "value"]);
    expect(wellFormed.message).not.toContain("Bearer");

    expect(issuesOf([bearer("{{not a key}}")])[0].message).toBe(AGENT_VAULT_INLINE_SERVICE_VARIABLE_MESSAGE);
  });

  test("refuses one in a basic credential, a custom header and a substitution", () => {
    const issues = issuesOf([
      {
        type: "http",
        hostPattern: "api.example.com",
        credential: { type: "basic", username: "{{USER}}", password: "secret" },
        customHeaders: [{ name: "X-Key", value: "{{KEY}}" }],
        substitutions: [{ placeholder: "TEAM", surfaces: ["path"], value: "{{TEAM}}" }]
      }
    ]);
    expect(issues.map((issue) => issue.path)).toEqual([
      [0, "credential", "username"],
      [0, "customHeaders", 0, "value"],
      [0, "substitutions", 0, "value"]
    ]);
  });

  test("accepts braces that don't read as a reference", () => {
    expect(issuesOf([bearer('{"scope":{"read":true}}'), bearer("a {{ b", { hostPattern: "b.example.com" })])).toEqual(
      []
    );
  });

  test("needs a name to be unique, but not present", () => {
    const issues = issuesOf([
      bearer("one", { name: "api" }),
      bearer("two", { name: "api", hostPattern: "b.example.com" }),
      bearer("three", { hostPattern: "c.example.com" })
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0].path).toEqual([1, "name"]);
  });

  test("caps the list at 20", () => {
    const services = Array.from({ length: 21 }, (_, index) =>
      bearer("token", { hostPattern: `h${index}.example.com` })
    );
    expect(issuesOf(services)[0]).toMatchObject({
      code: "custom",
      message:
        "A session can carry at most 20 inline services. Add the others to the project and list them by name instead."
    });
  });

  test("takes a description like a bundle service's, a blank one as none", () => {
    const parsed = AgentVaultSessionServicesInputSchema.parse([
      bearer("one", { description: "  Payments, read only  " }),
      bearer("two", { hostPattern: "b.example.com", description: "   " }),
      bearer("three", { hostPattern: "c.example.com" })
    ]);
    expect(parsed.map((service) => (typeof service === "string" ? service : service.description))).toEqual([
      "Payments, read only",
      null,
      undefined
    ]);

    expect(issuesOf([bearer("token", { description: "zero\u{200B}width" })])[0]).toMatchObject({
      path: [0, "description"],
      message: AGENT_VAULT_SERVICE_DESCRIPTION_MESSAGE
    });
  });

  test("needs a half of a basic credential", () => {
    const [issue] = issuesOf([{ type: "http", hostPattern: "api.example.com", credential: { type: "basic" } }]);
    expect(issue.message).toBe("A basic credential needs a username, a password, or both");
  });

  // Refused by name in the session service, which can say why.
  test("passes OAuth and member-provided fields through to be refused by name", () => {
    expect(issuesOf([{ type: "http", hostPattern: "api.example.com", credential: { type: "oauth" } }])).toEqual([]);
    expect(
      issuesOf([
        bearer("token", { credential: { type: "bearer", value: "token", memberProvidedFields: ["credential-value"] } })
      ])
    ).toEqual([]);
  });
});

describe("database and SSH services in the inline request schema", () => {
  const postgres = (extra: Record<string, unknown> = {}) => ({
    type: "postgres",
    name: "analytics",
    host: "db.internal",
    database: "app",
    credential: { type: "basic", username: "agent", password: "p" },
    ...extra
  });

  test("take a name of at most 63 characters, the longest DNS label the agent can connect by", () => {
    expect(issuesOf([postgres({ name: "a".repeat(63) })])).toEqual([]);
    expect(issuesOf([postgres({ name: "a".repeat(64) })]).map((issue) => issue.path)).toEqual([[0, "name"]]);
  });

  test("need a name", () => {
    expect(issuesOf([postgres({ name: undefined })]).map((issue) => issue.path)).toEqual([[0, "name"]]);
  });

  test("refuse a variable reference in an SSH key", () => {
    const issues = issuesOf([
      {
        type: "ssh",
        name: "bastion",
        host: "bastion.internal",
        credential: { type: "ssh-key", username: "agent", privateKey: "{{KEY}}" }
      }
    ]);
    expect(issues.map((issue) => issue.path)).toEqual([[0, "credential", "privateKey"]]);
  });

  test("take a multi-line SSH key", () => {
    expect(
      issuesOf([
        {
          type: "ssh",
          name: "bastion",
          host: "bastion.internal",
          credential: {
            type: "ssh-key",
            username: "agent",
            privateKey: "-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n-----END OPENSSH PRIVATE KEY-----"
          }
        }
      ])
    ).toEqual([]);
  });
});

describe("hooks in the inline request schema", () => {
  test("an inline service names a saved hook, with its narrowing", () => {
    const parsed = AgentVaultSessionServicesInputSchema.parse([
      bearer("token", { hook: { name: " Approvals ", methods: ["POST"] } })
    ]) as Record<string, unknown>[];
    expect(parsed[0]).toHaveProperty("hook", { name: "approvals", methods: ["POST"] });
  });

  test("a hook sent by URL and secret is refused, since only saved hooks can be named", () => {
    const hook = { url: "https://hooks.example.com/agent-vault", signingSecret: "s".repeat(32) };
    expect(AgentVaultSessionServicesInputSchema.safeParse([bearer("token", { hook })]).success).toBe(false);
  });
});

describe("OAuth sent with a session", () => {
  const oauth = (credential: Record<string, unknown>) => [
    { type: "http", hostPattern: "www.googleapis.com", credential: { type: "oauth", ...credential } }
  ];

  test("takes an OAuth variable's key, or tokens with the provider's details", () => {
    expect(issuesOf(oauth({ variable: "GDRIVE_U123" }))).toEqual([]);
    expect(
      issuesOf(
        oauth({
          accessToken: "ya29.access",
          refreshToken: "1//refresh",
          expiresAt: "2026-11-18T12:00:00Z",
          authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
          tokenEndpoint: "https://oauth2.googleapis.com/token",
          clientId: "client-1",
          clientSecret: "secret-1",
          scopes: ["https://www.googleapis.com/auth/drive"]
        })
      )
    ).toEqual([]);
  });

  test("refuses a token endpoint that isn't https, and a token with a line break", () => {
    expect(issuesOf(oauth({ accessToken: "a", tokenEndpoint: "http://oauth2.example.com/token" }))[0].path).toEqual([
      0,
      "credential",
      "tokenEndpoint"
    ]);
    expect(issuesOf(oauth({ accessToken: "a\nb" }))[0].path).toEqual([0, "credential", "accessToken"]);
  });
});

describe("an inline OAuth credential with fields left to members", () => {
  test("keeps them through the schema, so the session refuses them with a 400", () => {
    const [parsed] = AgentVaultSessionServicesInputSchema.parse([
      {
        type: "http",
        hostPattern: "api.example.com",
        credential: { type: "oauth", variable: "GDRIVE_U123", memberProvidedFields: ["credential-value"] }
      }
    ]);
    expect(parsed).toMatchObject({ credential: { memberProvidedFields: ["credential-value"] } });

    expect(() => prepareInlineServices([parsed as TAgentVaultInlineServiceInput])).toThrow(BadRequestError);
    expect(() => prepareInlineServices([parsed as TAgentVaultInlineServiceInput])).toThrow(
      /can't leave a field to members/
    );
  });
});
