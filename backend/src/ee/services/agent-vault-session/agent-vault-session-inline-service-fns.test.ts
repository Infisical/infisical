import { describe, expect, test } from "vitest";

import { TAgentVaultSessionInlineServices } from "@app/db/schemas";

import {
  AgentVaultCredentialType,
  AgentVaultMcpTransport,
  AgentVaultServiceType,
  AgentVaultSubstitutionSurface
} from "../agent-vault/agent-vault-enums";
import {
  assertNoAccessBundleConflicts,
  inlineServiceDisplayName,
  prepareInlineServices,
  toInlineServiceSummary,
  toResolvedInlineService
} from "./agent-vault-session-inline-service-fns";
import { TAgentVaultInlineServiceInput } from "./agent-vault-session-types";

const httpBearer = (overrides: Partial<TAgentVaultInlineServiceInput> = {}): TAgentVaultInlineServiceInput => ({
  type: AgentVaultServiceType.Http,
  hostPattern: "api.example.com",
  credential: { type: AgentVaultCredentialType.Bearer, value: "sk-live" },
  ...overrides
});

const storedRow = (overrides: Partial<TAgentVaultSessionInlineServices> = {}): TAgentVaultSessionInlineServices => ({
  id: "inline-1",
  sessionId: "session-1",
  position: 0,
  name: null,
  type: AgentVaultServiceType.Http,
  config: {},
  hostPattern: "api.example.com",
  allowedMethods: null,
  allowedPathPrefixes: null,
  credentialType: AgentVaultCredentialType.Bearer,
  credentialConfig: { type: AgentVaultCredentialType.Bearer, headerName: "Authorization", headerPrefix: "Bearer" },
  customHeaders: [],
  substitutions: [],
  encryptedSecrets: null,
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
    expect(service.secrets).toEqual({ credential: { value: "sk-live" }, customHeaders: [], substitutions: [] });
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
    ).toThrow(/^Service at index 1: Services sent with a session can't use OAuth/);
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

  test("offers only a bearer token for an MCP service, since OAuth isn't available inline", () => {
    expect(() =>
      prepareInlineServices([
        {
          type: AgentVaultServiceType.Mcp,
          serverUrl: "https://mcp.example.com/mcp",
          transport: AgentVaultMcpTransport.StreamableHttp,
          credential: { type: AgentVaultCredentialType.Passthrough }
        }
      ])
    ).toThrow("Service at index 0: An MCP service can't use pass-through as its credential. Use a bearer token.");
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

  test("refuses a tool list on an MCP server, rather than dropping it", () => {
    expect(() =>
      prepareInlineServices([
        {
          type: AgentVaultServiceType.Mcp,
          serverUrl: "https://mcp.example.com/mcp",
          transport: AgentVaultMcpTransport.StreamableHttp,
          credential: { type: AgentVaultCredentialType.Bearer, value: "token" },
          allowedTools: ["search"]
        }
      ])
    ).toThrow(/^Service at index 0: Services sent with a session can't limit an MCP server's tools/);
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

  test("the summary carries no secret, nor anything else stored beside the credential", () => {
    const summary = toInlineServiceSummary(
      storedRow({
        encryptedSecrets: Buffer.from("sealed"),
        credentialConfig: {
          type: AgentVaultCredentialType.Bearer,
          headerName: "Authorization",
          headerPrefix: "Bearer",
          source: AgentVaultCredentialType.OAuth
        }
      })
    );
    expect(summary).not.toHaveProperty("encryptedSecrets");
    expect(summary.credential).toEqual({
      type: AgentVaultCredentialType.Bearer,
      headerName: "Authorization",
      headerPrefix: "Bearer"
    });
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
          customHeaders: [{ name: "X-Team", prefix: "" }]
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
      toResolvedInlineService(storedRow({ customHeaders: [{ name: "X-Team", prefix: "" }] }), {
        credential: { value: "token" },
        customHeaders: [],
        substitutions: []
      })
    ).toBeNull();
    expect(
      toResolvedInlineService(
        storedRow({ substitutions: [{ placeholder: "ACME_KEY", surfaces: [AgentVaultSubstitutionSurface.Header] }] }),
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
