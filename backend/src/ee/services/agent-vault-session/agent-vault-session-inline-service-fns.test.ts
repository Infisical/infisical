import { describe, expect, test } from "vitest";

import { hashAccessToken } from "../agent-vault-oauth/agent-vault-oauth-token-fns";
import { AgentVaultOauthClientAuthMethod } from "../agent-vault-oauth/agent-vault-oauth-types";
import {
  AgentVaultCredentialType,
  AgentVaultMcpTransport,
  AgentVaultOauthStatus,
  AgentVaultServiceType,
  AgentVaultSubstitutionSurface,
  AgentVaultVariableType
} from "../agent-vault/agent-vault-enums";
import { TAgentVaultInlineServiceSecretsRow } from "./agent-vault-session-inline-service-dal";
import {
  assertNoAccessBundleConflicts,
  bindInlineOauthVariables,
  inlineServiceDisplayName,
  openInlineServiceSecrets,
  prepareInlineServices,
  toInlineServiceFacts,
  toInlineServiceSummary,
  toResolvedInlineService,
  withoutShadowedServices
} from "./agent-vault-session-inline-service-fns";
import { TAgentVaultInlineServiceInput } from "./agent-vault-session-types";

const httpBearer = (overrides: Partial<TAgentVaultInlineServiceInput> = {}): TAgentVaultInlineServiceInput => ({
  type: AgentVaultServiceType.Http,
  hostPattern: "api.example.com",
  credential: { type: AgentVaultCredentialType.Bearer, value: "sk-live" },
  ...overrides
});

const storedRow = (
  overrides: Partial<TAgentVaultInlineServiceSecretsRow> = {}
): TAgentVaultInlineServiceSecretsRow => ({
  id: "inline-1",
  projectId: "project-1",
  sessionId: "session-1",
  position: 0,
  name: null,
  description: null,
  type: AgentVaultServiceType.Http,
  config: {},
  hostPattern: "api.example.com",
  allowedMethods: null,
  allowedPathPrefixes: null,
  credentialType: AgentVaultCredentialType.Bearer,
  credentialConfig: { type: AgentVaultCredentialType.Bearer, headerName: "Authorization", headerPrefix: "Bearer" },
  allowedTools: null,
  memberProvidedFields: null,
  customHeaders: [],
  substitutions: [],
  encryptedCredential: null,
  secretsDeletedAt: null,
  hookUrl: null,
  encryptedHookSecret: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides
});

describe("prepareInlineServices", () => {
  test("settles a bearer credential the way a bundle service does and keeps its value to seal", () => {
    const [service] = prepareInlineServices([httpBearer()]);
    expect(service.name).toBeNull();
    expect(service.credentialConfig).toEqual({
      type: AgentVaultCredentialType.Bearer,
      headerName: "Authorization",
      headerPrefix: "Bearer"
    });
    expect(service.secrets).toEqual({
      credential: { value: "sk-live" },
      customHeaders: [],
      substitutions: []
    });
  });

  test("keeps custom header and substitution values out of the stored names and seals them in order", () => {
    const [service] = prepareInlineServices([
      httpBearer({
        customHeaders: [{ name: "X-Team", value: "platform" }],
        substitutions: [
          { placeholder: "TEAM_ID", surfaces: [AgentVaultSubstitutionSurface.Path], value: "42" },
          { placeholder: "REGION", surfaces: [AgentVaultSubstitutionSurface.Query], value: "eu" }
        ]
      })
    ]);
    expect(service.customHeaders).toEqual([{ name: "X-Team", prefix: "" }]);
    expect(service.substitutions.map((substitution) => substitution.placeholder)).toEqual(["TEAM_ID", "REGION"]);
    expect(service.secrets?.customHeaders).toEqual(["platform"]);
    expect(service.secrets?.substitutions).toEqual(["42", "eu"]);
  });

  test("keeps the description it was sent with, and null for a service sent without one", () => {
    const [described, bare] = prepareInlineServices([
      httpBearer({ description: "Payments, read only" }),
      httpBearer({ hostPattern: "other.example.com" })
    ]);
    expect(described.description).toBe("Payments, read only");
    expect(bare.description).toBeNull();
  });

  test("seals nothing for a pass-through service with nothing to send", () => {
    const [service] = prepareInlineServices([
      httpBearer({ credential: { type: AgentVaultCredentialType.Passthrough } })
    ]);
    expect(service.secrets).toBeNull();
  });

  test("derives an MCP service's host from its server URL", () => {
    const [service] = prepareInlineServices([
      {
        type: AgentVaultServiceType.Mcp,
        serverUrl: "https://mcp.example.com/mcp",
        transport: AgentVaultMcpTransport.StreamableHttp,
        credential: { type: AgentVaultCredentialType.Bearer, value: "token" }
      }
    ]);
    expect(service.hostPattern).toBe("mcp.example.com");
    expect(service.config).toEqual({ serverUrl: "https://mcp.example.com/mcp", transport: "streamable-http" });
  });

  test("names the service in a refusal, by name or by index", () => {
    expect(() =>
      prepareInlineServices([
        httpBearer({ name: "github", serverUrl: "https://mcp.example.com/mcp" }),
        httpBearer({ hostPattern: "other.example.com" })
      ])
    ).toThrow(/^Service 'github': An HTTP service doesn't take 'serverUrl'/);
    expect(() =>
      prepareInlineServices([
        httpBearer(),
        httpBearer({ hostPattern: "other.example.com", credential: { type: AgentVaultCredentialType.OAuth } })
      ])
    ).toThrow(/^Service at index 1: An OAuth credential sent with a session needs 'variable'/);
  });

  test("refuses fields left to members", () => {
    expect(() =>
      prepareInlineServices([
        httpBearer({
          credential: {
            type: AgentVaultCredentialType.Bearer,
            value: "token",
            memberProvidedFields: ["credential-value"]
          }
        })
      ])
    ).toThrow(/can't leave a field to members/);
  });

  test("offers a bearer token or OAuth for an MCP service", () => {
    expect(() =>
      prepareInlineServices([
        {
          type: AgentVaultServiceType.Mcp,
          serverUrl: "https://mcp.example.com/mcp",
          transport: AgentVaultMcpTransport.StreamableHttp,
          credential: { type: AgentVaultCredentialType.Passthrough }
        }
      ])
    ).toThrow(
      "Service at index 0: An MCP service can't use pass-through as its credential. Use a bearer token or OAuth."
    );
  });

  test("refuses a custom header that would shadow the credential's", () => {
    expect(() =>
      prepareInlineServices([httpBearer({ customHeaders: [{ name: "authorization", value: "x" }] })])
    ).toThrow(/The Authorization header is already set by the credential/);
  });

  test("refuses two inline services covering the same pattern but allows an exact host beside a wildcard", () => {
    expect(() =>
      prepareInlineServices([httpBearer({ name: "first" }), httpBearer({ hostPattern: "API.example.com" })])
    ).toThrow(
      "The service 'first' and the service at index 1 both cover api.example.com:443. Remove it from one of them."
    );
    expect(() => prepareInlineServices([httpBearer({ hostPattern: "*.example.com" }), httpBearer()])).not.toThrow();
  });

  test("refuses a service sent without a name whose first host is another service's name", () => {
    expect(() =>
      prepareInlineServices([
        httpBearer({ name: "localhost", hostPattern: "api.example.com" }),
        httpBearer({ hostPattern: "localhost" })
      ])
    ).toThrow(
      "The service 'localhost' and the service at index 1 would both be called 'localhost', since a service sent without a name goes by its first host. Give one of them a different name."
    );
  });

  test("keeps an MCP server's tool list, and null when it was sent without one", () => {
    const mcp = (allowedTools?: string[] | null): TAgentVaultInlineServiceInput => ({
      type: AgentVaultServiceType.Mcp,
      serverUrl: "https://mcp.example.com/mcp",
      transport: AgentVaultMcpTransport.StreamableHttp,
      credential: { type: AgentVaultCredentialType.Bearer, value: "token" },
      allowedTools
    });
    expect(prepareInlineServices([mcp(["search", "read_file"])])[0].allowedTools).toEqual(["search", "read_file"]);
    expect(prepareInlineServices([mcp()])[0].allowedTools).toBeNull();
    expect(prepareInlineServices([mcp(null)])[0].allowedTools).toBeNull();
  });

  test("refuses a tool list on an HTTP service", () => {
    expect(() => prepareInlineServices([httpBearer({ allowedTools: ["search"] })])).toThrow(/^Service at index 0: /);
  });

  test("refuses a basic credential with neither half", () => {
    expect(() => prepareInlineServices([httpBearer({ credential: { type: AgentVaultCredentialType.Basic } })])).toThrow(
      "Service at index 0: A basic credential needs a username, a password, or both"
    );
  });
});

describe("assertNoAccessBundleConflicts", () => {
  const bundle = { name: "prod", services: [{ id: "service-1", name: "github", hostPattern: "api.github.com" }] };

  test("refuses an inline service covering a pattern the bundle already covers", () => {
    const prepared = prepareInlineServices([httpBearer({ hostPattern: "uploads.github.com,api.github.com" })]);
    expect(() => assertNoAccessBundleConflicts(prepared, bundle)).toThrow(
      "The service at index 0 covers api.github.com:443, which 'github' in the access bundle 'prod' already covers. Remove it from the service at index 0."
    );
  });

  test("refuses an inline service called the same as one of the bundle's", () => {
    const prepared = prepareInlineServices([httpBearer({ name: "github", hostPattern: "github.example.com" })]);
    expect(() => assertNoAccessBundleConflicts(prepared, bundle)).toThrow(
      "The service 'github' has the same name as a service in the access bundle 'prod'. Give it a different name."
    );
    // Hosts match regardless of case, so a host typed in capitals still clashes.
    const unnamed = prepareInlineServices([httpBearer({ hostPattern: "GitHub" })]);
    expect(() => assertNoAccessBundleConflicts(unnamed, bundle)).toThrow(
      "The service at index 0 goes by its first host, 'github', which is the name of a service in the access bundle 'prod'. Give it a name."
    );
  });

  test("allows a wildcard that contains the bundle's exact host", () => {
    const prepared = prepareInlineServices([httpBearer({ hostPattern: "*.github.com" })]);
    expect(() => assertNoAccessBundleConflicts(prepared, bundle)).not.toThrow();
  });
});

describe("inline service reads", () => {
  test("falls back to the first host for a service sent without a name", () => {
    expect(inlineServiceDisplayName({ name: null, hostPattern: " api.example.com , *.example.org" })).toBe(
      "api.example.com"
    );
    expect(inlineServiceDisplayName({ name: "openai", hostPattern: "api.openai.com" })).toBe("openai");
    expect(inlineServiceDisplayName({ name: null, hostPattern: "api.example.com:443, b.example.com" })).toBe(
      "api.example.com"
    );
    expect(inlineServiceDisplayName({ name: null, hostPattern: "api.example.com:8443" })).toBe("api.example.com:8443");
    expect(inlineServiceDisplayName({ name: null, hostPattern: "API.Example.com" })).toBe("api.example.com");
  });

  test("the summary names a service sent without a name by its first host", () => {
    expect(toInlineServiceSummary(storedRow()).name).toBe("api.example.com");
    expect(toInlineServiceSummary(storedRow({ name: "example" })).name).toBe("example");
  });

  test("the summary carries the description, and null for a service sent without one", () => {
    expect(toInlineServiceSummary(storedRow({ description: "Payments, read only" })).description).toBe(
      "Payments, read only"
    );
    expect(toInlineServiceSummary(storedRow()).description).toBeNull();
  });

  test("the summary carries no secret, nor anything else stored beside the credential", () => {
    const summary = toInlineServiceSummary(
      storedRow({
        encryptedCredential: Buffer.from("sealed"),
        credentialConfig: {
          type: AgentVaultCredentialType.Bearer,
          headerName: "Authorization",
          headerPrefix: "Bearer",
          source: AgentVaultCredentialType.OAuth
        }
      })
    );
    expect(summary).not.toHaveProperty("encryptedCredential");
    expect(summary.credential).toEqual({
      type: AgentVaultCredentialType.Bearer,
      headerName: "Authorization",
      headerPrefix: "Bearer"
    });
  });

  test("the summary carries the service's hook and its narrowing, or null, only when given the hook names", () => {
    const row = storedRow({ hookId: "hook-1", hookMethods: ["POST"], hookPaths: ["/v1/charges"], hookTools: null });
    expect(toInlineServiceSummary(row, new Map(), new Map([["hook-1", "approvals"]])).hook).toEqual({
      id: "hook-1",
      name: "approvals",
      methods: ["POST"],
      paths: ["/v1/charges"]
    });
    expect(toInlineServiceSummary(row)).not.toHaveProperty("hook");
    expect(toInlineServiceSummary(storedRow(), new Map(), new Map([["hook-1", "approvals"]])).hook).toBeNull();
  });
});

describe("an MCP server's tool list", () => {
  const mcpRow = storedRow({
    type: AgentVaultServiceType.Mcp,
    hostPattern: "mcp.example.com",
    config: { serverUrl: "https://mcp.example.com/mcp", transport: AgentVaultMcpTransport.StreamableHttp },
    allowedTools: ["search"]
  });

  test("goes out to the proxy", () => {
    expect(
      toResolvedInlineService(mcpRow, {
        credential: { value: "token" },
        customHeaders: [],
        substitutions: []
      })
    ).toMatchObject({ allowedTools: ["search"] });
  });

  test("is in the summary, and null when the server was sent without one", () => {
    expect(toInlineServiceSummary(mcpRow)).toMatchObject({ allowedTools: ["search"] });
    expect(toInlineServiceSummary({ ...mcpRow, allowedTools: null })).toMatchObject({ allowedTools: null });
  });
});

describe("toResolvedInlineService", () => {
  test("sends the values as they were stored, braces and all, with no bundle", () => {
    const resolved = toResolvedInlineService(storedRow(), {
      credential: { value: "{{literal}}" },
      customHeaders: [],
      substitutions: []
    });
    expect(resolved).toMatchObject({
      name: "api.example.com",
      accessBundleName: null,
      allowedTools: null,
      personalValuesMissing: false,
      credential: { type: AgentVaultCredentialType.Bearer, value: "{{literal}}" }
    });
  });

  test("leaves out a service whose secrets were deleted when its session ended", () => {
    expect(toResolvedInlineService(storedRow(), null)).toBeNull();
    expect(
      toResolvedInlineService(
        storedRow({
          credentialType: AgentVaultCredentialType.Passthrough,
          credentialConfig: { type: AgentVaultCredentialType.Passthrough },
          customHeaders: [{ name: "X-Team", prefix: "", encryptedValue: null }]
        }),
        null
      )
    ).toBeNull();
  });

  test("sends a pass-through service that never had anything to seal", () => {
    expect(
      toResolvedInlineService(
        storedRow({
          credentialType: AgentVaultCredentialType.Passthrough,
          credentialConfig: { type: AgentVaultCredentialType.Passthrough }
        }),
        null
      )
    ).toMatchObject({ credential: { type: AgentVaultCredentialType.Passthrough }, customHeaders: [] });
  });

  test("leaves out a service whose sealed values don't line up with its stored names", () => {
    expect(
      toResolvedInlineService(storedRow({ customHeaders: [{ name: "X-Team", prefix: "", encryptedValue: null }] }), {
        credential: { value: "token" },
        customHeaders: [],
        substitutions: []
      })
    ).toBeNull();
    expect(
      toResolvedInlineService(
        storedRow({
          substitutions: [
            { placeholder: "ACME_KEY", surfaces: [AgentVaultSubstitutionSurface.Header], encryptedValue: null }
          ]
        }),
        { credential: { value: "token" }, customHeaders: [], substitutions: [] }
      )
    ).toBeNull();
  });

  test("leaves out a service whose sealed credential is the wrong kind", () => {
    expect(
      toResolvedInlineService(storedRow(), {
        credential: { username: "user", password: "pass" },
        customHeaders: [],
        substitutions: []
      })
    ).toBeNull();
    expect(
      toResolvedInlineService(
        storedRow({
          credentialType: AgentVaultCredentialType.Basic,
          credentialConfig: { type: AgentVaultCredentialType.Basic }
        }),
        { credential: { value: "token" }, customHeaders: [], substitutions: [] }
      )
    ).toBeNull();
  });

  test("sends a basic credential's username and password", () => {
    expect(
      toResolvedInlineService(
        storedRow({
          credentialType: AgentVaultCredentialType.Basic,
          credentialConfig: { type: AgentVaultCredentialType.Basic }
        }),
        { credential: { username: "user", password: "pass" }, customHeaders: [], substitutions: [] }
      )?.credential
    ).toEqual({ type: AgentVaultCredentialType.Basic, username: "user", password: "pass" });
  });

  // An OAuth source would make the proxy try to refresh a token it was sent as is.
  test("sends only the bearer fields, whatever else is stored beside them", () => {
    expect(
      toResolvedInlineService(
        storedRow({
          credentialConfig: {
            type: AgentVaultCredentialType.Bearer,
            headerName: "Authorization",
            headerPrefix: "Bearer",
            source: AgentVaultCredentialType.OAuth
          }
        }),
        { credential: { value: "token" }, customHeaders: [], substitutions: [] }
      )?.credential
    ).toEqual({
      type: AgentVaultCredentialType.Bearer,
      headerName: "Authorization",
      headerPrefix: "Bearer",
      value: "token"
    });
  });
});

describe("inline services written with a hook before hooks became their own resource", () => {
  const seal = (value: unknown) => Buffer.from(JSON.stringify(value));
  const open = (sealed: Buffer) => JSON.parse(sealed.toString()) as unknown;
  const legacyHooked = (overrides: Partial<TAgentVaultInlineServiceSecretsRow> = {}) =>
    storedRow({
      credentialType: AgentVaultCredentialType.Passthrough,
      credentialConfig: { type: AgentVaultCredentialType.Passthrough },
      hookUrl: "https://hooks.example.com/agent-vault",
      encryptedHookSecret: seal({ value: "s".repeat(32) }),
      ...overrides
    });

  // Resolve attaches the hook from the row's URL and secret afterwards, with every other service's hook.
  test("still resolve, with the hook left for resolve to attach", () => {
    const resolved = toResolvedInlineService(legacyHooked(), openInlineServiceSecrets(legacyHooked(), open));
    expect(resolved).toMatchObject({ hook: null });
  });

  test("a pass-through service with only a legacy hook needs nothing sealed", () => {
    expect(openInlineServiceSecrets(legacyHooked({ encryptedHookSecret: null }), open)).toBeNull();
    expect(toInlineServiceFacts(legacyHooked({ encryptedHookSecret: null }), () => true)).not.toBeNull();
  });

  test("reads carry no hook", () => {
    expect(toInlineServiceSummary(legacyHooked())).not.toHaveProperty("hook");
  });
});

describe("an inline service's saved hook", () => {
  const http = (hook: TAgentVaultInlineServiceInput["hook"]): TAgentVaultInlineServiceInput => ({
    type: AgentVaultServiceType.Http,
    hostPattern: "api.example.com",
    credential: { type: AgentVaultCredentialType.Passthrough },
    hook
  });

  test("is kept by name for mint to find, and null without one", () => {
    const [withHook, withoutHook] = prepareInlineServices([
      http({ name: "approvals", paths: ["/charges"] }),
      { ...http(undefined), hostPattern: "other.example.com" }
    ]);
    expect(withHook.hook).toEqual({ name: "approvals", paths: ["/charges"] });
    expect(withoutHook.hook).toBeNull();
  });

  test("refuses a narrowing the service's type can't use, naming the service by its host", () => {
    expect(() => prepareInlineServices([http({ name: "approvals", tools: ["t"] })])).toThrow(
      "'api.example.com' is an HTTP service, and only an MCP service can be narrowed by tools. Leave them out to check every request to it."
    );
  });
});

describe("database and SSH services sent with a session", () => {
  const KEY = "-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n-----END OPENSSH PRIVATE KEY-----";
  const postgres = (overrides: Partial<TAgentVaultInlineServiceInput> = {}): TAgentVaultInlineServiceInput => ({
    type: AgentVaultServiceType.Postgres,
    name: "analytics",
    host: "db.internal",
    database: "app",
    credential: { type: AgentVaultCredentialType.Basic, username: "agent", password: "p" },
    ...overrides
  });

  test("have no host pattern and keep their server in config", () => {
    const [service] = prepareInlineServices([postgres()]);
    expect(service.hostPattern).toBeNull();
    expect(service.config).toEqual({
      host: "db.internal",
      port: 5432,
      database: "app",
      tls: { enabled: true, verify: true }
    });
  });

  test("need a username to log in as", () => {
    expect(() =>
      prepareInlineServices([postgres({ credential: { type: AgentVaultCredentialType.Basic, password: "p" } })])
    ).toThrow("A PostgreSQL service needs a username to log in as. Set one in the credential.");
  });

  test("never overlap an HTTP service on the same host", () => {
    expect(() =>
      prepareInlineServices([postgres(), httpBearer({ name: "web", hostPattern: "db.internal" })])
    ).not.toThrow();
    expect(() =>
      assertNoAccessBundleConflicts(prepareInlineServices([postgres()]), {
        name: "bundle",
        services: [{ id: "s1", name: "web", hostPattern: "db.internal:5432" }]
      })
    ).not.toThrow();
  });

  test("an SSH key goes out to the proxy as it was sent", () => {
    const [prepared] = prepareInlineServices([
      {
        type: AgentVaultServiceType.Ssh,
        name: "bastion",
        host: "bastion.internal",
        credential: { type: AgentVaultCredentialType.SshKey, username: "agent", privateKey: KEY }
      }
    ]);
    expect(prepared.credentialConfig).toEqual({ type: AgentVaultCredentialType.SshKey, hasCertificate: false });

    const row = storedRow({
      name: "bastion",
      type: AgentVaultServiceType.Ssh,
      config: prepared.config,
      hostPattern: null,
      credentialType: AgentVaultCredentialType.SshKey,
      credentialConfig: prepared.credentialConfig
    });
    const resolved = toResolvedInlineService(row, prepared.secrets);
    expect(resolved?.credential).toEqual({
      type: AgentVaultCredentialType.SshKey,
      username: "agent",
      privateKey: KEY
    });
    expect(resolved?.native).toEqual({ host: "bastion.internal", port: 22, database: null, tls: null });
    const summary = toInlineServiceSummary(row);
    expect(summary).toMatchObject({ type: AgentVaultServiceType.Ssh, host: "bastion.internal", port: 22 });
    expect(summary).not.toHaveProperty("hostPattern");
  });

  test("a basic secret is never read as an SSH key", () => {
    const row = storedRow({
      name: "bastion",
      type: AgentVaultServiceType.Ssh,
      config: { host: "bastion.internal", port: 22 },
      hostPattern: null,
      credentialType: AgentVaultCredentialType.SshKey,
      credentialConfig: { type: AgentVaultCredentialType.SshKey, hasCertificate: false }
    });
    expect(
      toResolvedInlineService(row, {
        credential: { username: "agent", password: "p" },
        customHeaders: [],
        substitutions: []
      })
    ).toBeNull();
  });
});

describe("openInlineServiceSecrets", () => {
  // Stands in for the project cipher: the "sealed" bytes are the JSON itself.
  const seal = (value: unknown) => Buffer.from(JSON.stringify(value));
  const open = (sealed: Buffer) => JSON.parse(sealed.toString()) as unknown;

  test("opens each sealed value, in the order of the names beside them", () => {
    const row = storedRow({
      encryptedCredential: seal({ value: "sk-live" }),
      customHeaders: [
        { name: "X-Team", prefix: "", encryptedValue: seal({ value: "payments" }) },
        { name: "X-Run", prefix: "", encryptedValue: seal({ value: "7" }) }
      ],
      substitutions: [{ placeholder: "__ORG__", surfaces: ["path"], encryptedValue: seal({ value: "acme" }) }]
    });
    expect(openInlineServiceSecrets(row, open)).toEqual({
      credential: { value: "sk-live" },
      customHeaders: ["payments", "7"],
      substitutions: ["acme"]
    });
  });

  test("is null once the session ended, or when any value is missing", () => {
    const sealed = storedRow({ encryptedCredential: seal({ value: "sk-live" }) });
    expect(openInlineServiceSecrets({ ...sealed, secretsDeletedAt: new Date() }, open)).toBeNull();
    expect(openInlineServiceSecrets({ ...sealed, encryptedCredential: null }, open)).toBeNull();
    expect(
      openInlineServiceSecrets(
        { ...sealed, customHeaders: [{ name: "X-Team", prefix: "", encryptedValue: null }] },
        open
      )
    ).toBeNull();
  });

  test("a pass-through service with nothing to seal has no secrets and still goes out", () => {
    const row = storedRow({
      credentialType: AgentVaultCredentialType.Passthrough,
      credentialConfig: { type: AgentVaultCredentialType.Passthrough }
    });
    expect(openInlineServiceSecrets(row, open)).toBeNull();
    expect(toResolvedInlineService(row, null)?.credential).toEqual({ type: AgentVaultCredentialType.Passthrough });
  });
});

describe("OAuth sent with a session", () => {
  const VARIABLE_ID = "77777777-7777-4777-8777-777777777777";
  const variables = [
    { id: VARIABLE_ID, key: "GDRIVE_U123", type: AgentVaultVariableType.OAuth },
    { id: "text-1", key: "OPENAI_KEY", type: AgentVaultVariableType.Text }
  ];
  const withVariable = (key: string) =>
    httpBearer({ name: "gdrive", credential: { type: AgentVaultCredentialType.OAuth, variable: key } });
  const tokens = {
    type: AgentVaultCredentialType.OAuth,
    accessToken: "ya29.access",
    refreshToken: "1//refresh",
    expiresAt: "2026-11-18T12:00:00Z",
    authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenEndpoint: "https://oauth2.googleapis.com/token",
    clientId: "client-1",
    clientSecret: "secret-1",
    scopes: ["https://www.googleapis.com/auth/drive"]
  } as const;

  test("an OAuth variable is stored by id, with nothing sealed", () => {
    const [service] = bindInlineOauthVariables(prepareInlineServices([withVariable("GDRIVE_U123")]), variables);

    expect(service.credentialConfig).toEqual({
      type: AgentVaultCredentialType.OAuth,
      source: "variable",
      variableId: VARIABLE_ID
    });
    expect(service.secrets).toBeNull();
  });

  test("a key that names no variable, or a text variable, is refused by name", () => {
    const prepared = (key: string) => prepareInlineServices([withVariable(key)]);
    expect(() => bindInlineOauthVariables(prepared("MISSING"), variables)).toThrow(
      "Service 'gdrive': There's no global variable named 'MISSING'"
    );
    expect(() => bindInlineOauthVariables(prepared("OPENAI_KEY"), variables)).toThrow(
      "Service 'gdrive': 'OPENAI_KEY' is a text variable"
    );
  });

  test("a variable and tokens together, or a sign-in, are refused", () => {
    expect(() =>
      prepareInlineServices([
        httpBearer({ credential: { type: AgentVaultCredentialType.OAuth, variable: "GDRIVE_U123", accessToken: "x" } })
      ])
    ).toThrow("Send either 'variable' or the tokens and the provider's details, not both. Leave out 'accessToken'.");
    expect(() =>
      prepareInlineServices([
        httpBearer({
          credential: { type: AgentVaultCredentialType.OAuth, authorizationId: "88888888-8888-4888-8888-888888888888" }
        })
      ])
    ).toThrow(/can't use an OAuth sign-in/);
  });

  test("tokens are stored as sent, with the connection a refresh needs", () => {
    const [service] = prepareInlineServices([httpBearer({ credential: { ...tokens, scopes: [...tokens.scopes] } })]);

    expect(service.secrets?.credential).toEqual({
      accessToken: "ya29.access",
      refreshToken: "1//refresh",
      clientSecret: "secret-1"
    });
    expect(service.credentialConfig).toMatchObject({
      type: AgentVaultCredentialType.OAuth,
      issuer: "https://accounts.google.com",
      tokenEndpoint: "https://oauth2.googleapis.com/token",
      clientId: "client-1",
      tokenEndpointAuthMethod: AgentVaultOauthClientAuthMethod.ClientSecretBasic,
      status: AgentVaultOauthStatus.Connected,
      expiresAt: "2026-11-18T12:00:00.000Z",
      accessTokenHash: hashAccessToken("ya29.access")
    });
  });

  test("tokens need the provider's endpoints, the client and the scopes", () => {
    const send = (credential: Record<string, unknown>) => () =>
      prepareInlineServices([httpBearer({ credential: { ...tokens, scopes: [...tokens.scopes], ...credential } })]);
    expect(send({ tokenEndpoint: undefined })).toThrow(/need the provider's 'tokenEndpoint'/);
    expect(send({ clientId: undefined })).toThrow(/need the provider's 'clientId'/);
    expect(send({ scopes: [] })).toThrow(/scopes they were granted/);
    expect(send({ accessToken: undefined })).toThrow(/needs 'variable'/);
    expect(send({ tokenEndpointAuthMethod: AgentVaultOauthClientAuthMethod.None })).toThrow(
      /'tokenEndpointAuthMethod' is 'none'/
    );
  });

  test("tokens go out on resolve, and the variable's resolution is used for a variable", () => {
    const sealed = { accessToken: "ya29.access", refreshToken: "1//refresh" };
    const tokenRow = storedRow({
      credentialType: AgentVaultCredentialType.OAuth,
      credentialConfig: { type: AgentVaultCredentialType.OAuth, status: AgentVaultOauthStatus.Connected },
      encryptedCredential: Buffer.from(JSON.stringify(sealed))
    });
    const secrets = openInlineServiceSecrets(tokenRow, (blob) => JSON.parse(blob.toString("utf-8")));
    expect(toResolvedInlineService(tokenRow, secrets)?.credential).toMatchObject({
      type: AgentVaultCredentialType.Bearer,
      value: "ya29.access",
      source: "oauth"
    });

    const variableRow = storedRow({
      credentialType: AgentVaultCredentialType.OAuth,
      credentialConfig: { type: AgentVaultCredentialType.OAuth, source: "variable", variableId: VARIABLE_ID }
    });
    expect(openInlineServiceSecrets(variableRow, () => ({}))).toBeNull();
    const notConnected = toResolvedInlineService(variableRow, null, {});
    expect(notConnected).toMatchObject({
      credential: { type: AgentVaultCredentialType.Passthrough },
      personalValuesMissing: true
    });
    expect(notConnected?.credentialRemoved).toBeUndefined();
    expect(notConnected?.credentialNotConnected).toBeUndefined();
    expect(toResolvedInlineService(variableRow, null, { notConnected: true })).toMatchObject({
      credential: { type: AgentVaultCredentialType.Passthrough },
      personalValuesMissing: true,
      credentialNotConnected: true
    });
    const removed = toResolvedInlineService(variableRow, null, { removed: true });
    expect(removed).toMatchObject({
      credential: { type: AgentVaultCredentialType.Passthrough },
      personalValuesMissing: true,
      credentialRemoved: true
    });
    expect(removed?.credentialNotConnected).toBeUndefined();
  });

  test("the agent is told the proxy adds an OAuth credential, and the summary never holds a token", () => {
    const variableRow = storedRow({
      credentialType: AgentVaultCredentialType.OAuth,
      credentialConfig: { type: AgentVaultCredentialType.OAuth, source: "variable", variableId: VARIABLE_ID }
    });
    expect(toInlineServiceFacts(variableRow, () => true)?.credential).toEqual({ type: "oauth" });
    expect(toInlineServiceFacts(variableRow, () => false)).toMatchObject({
      credential: { type: "none" },
      personalValuesMissing: true,
      credentialNotConnected: true
    });
    expect(
      toInlineServiceSummary(variableRow, new Map([[VARIABLE_ID, { id: VARIABLE_ID, key: "GDRIVE_U123" }]])).credential
    ).toEqual({
      type: AgentVaultCredentialType.OAuth,
      source: "variable",
      variable: { id: VARIABLE_ID, key: "GDRIVE_U123" }
    });
    expect(toInlineServiceSummary(variableRow).credential).toEqual({
      type: AgentVaultCredentialType.OAuth,
      source: "variable"
    });

    const [prepared] = prepareInlineServices([httpBearer({ credential: { ...tokens, scopes: [...tokens.scopes] } })]);
    const tokenRow = storedRow({
      credentialType: AgentVaultCredentialType.OAuth,
      credentialConfig: prepared.credentialConfig
    });
    expect(toInlineServiceSummary(tokenRow).credential).toEqual({
      type: AgentVaultCredentialType.OAuth,
      source: "inline",
      issuer: "https://accounts.google.com",
      grantedScopes: ["https://www.googleapis.com/auth/drive"]
    });
  });
});

describe("withoutShadowedServices", () => {
  const github = { name: "github" };
  const readOnly = { name: "gh-readonly", isOverride: true };

  test("an inline service drops a bundle service of its name", () => {
    const sent = { name: "github", hostPattern: "github.internal.example.com" };
    expect(withoutShadowedServices([github, { name: "linear" }], [sent])).toEqual({
      bundleServices: [{ name: "linear" }],
      inlineServices: [sent]
    });
  });

  test("an override keeps its place, and the inline service of its name is the one left out", () => {
    const sent = { name: "gh-readonly", hostPattern: "unrelated.example.com" };
    const unnamed = { hostPattern: "gh-readonly" };
    expect(withoutShadowedServices([github, readOnly], [sent, unnamed])).toEqual({
      bundleServices: [github, readOnly],
      inlineServices: []
    });
  });
});
