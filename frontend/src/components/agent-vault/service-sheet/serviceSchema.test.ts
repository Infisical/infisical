import { describe, expect, it } from "vitest";

import {
  AgentVaultCredentialType,
  AgentVaultMcpTransport,
  AgentVaultOAuthStatus,
  AgentVaultServiceType
} from "@app/hooks/api/agentVault";
import { TAgentVaultService } from "@app/hooks/api/agentVault/types";

import {
  buildServiceSchema,
  isOAuthAuthorizationMissing,
  newOAuthAuthorizationId,
  oauthStatusLabel,
  serverUrlError,
  storedOAuthCredential,
  TServiceForm
} from "./serviceSchema";

const SERVER_URL = "https://mcp.linear.app/mcp";

const mcpForm = (overrides: Partial<TServiceForm> = {}): TServiceForm => ({
  serviceType: AgentVaultServiceType.Mcp,
  name: "linear-mcp",
  serverUrl: SERVER_URL,
  transport: AgentVaultMcpTransport.StreamableHttp,
  hosts: [],
  hostDraft: "",
  pathDraft: "",
  credentialType: AgentVaultCredentialType.OAuth,
  headerName: "Authorization",
  headerPrefix: "Bearer",
  username: "",
  secret: "",
  oauthAuthorizationId: "",
  oauthAuthorizedUrl: "",
  oauthScopes: [],
  methods: [],
  pathPrefixes: [],
  customHeaders: [],
  substitutions: [],
  ...overrides
});

const storedOAuthService = (serverUrl = SERVER_URL) =>
  ({
    id: "service-1",
    accessBundleId: "bundle-1",
    name: "linear-mcp",
    hostPattern: "mcp.linear.app",
    type: AgentVaultServiceType.Mcp,
    config: { serverUrl, transport: AgentVaultMcpTransport.StreamableHttp },
    allowedMethods: null,
    allowedPathPrefixes: null,
    credential: {
      type: AgentVaultCredentialType.OAuth,
      status: AgentVaultOAuthStatus.NeedsReauthorization,
      issuer: "https://mcp.linear.app",
      grantedScopes: ["read"],
      requiredScopes: [],
      expiresAt: null,
      authorizedBy: null,
      authorizedAt: null,
      lastError: null
    },
    customHeaders: [],
    substitutions: [],
    createdAt: "2026-10-15T00:00:00.000Z",
    updatedAt: "2026-10-15T00:00:00.000Z"
  }) satisfies TAgentVaultService;

describe("serverUrlError", () => {
  it("rejects a query string", () => {
    expect(serverUrlError("https://mcp.example.com/mcp?token=abc")).toMatch(/query string/);
  });

  it("accepts a plain server URL", () => {
    expect(serverUrlError(SERVER_URL)).toBeNull();
  });
});

describe("isOAuthAuthorizationMissing", () => {
  it("requires an authorization for a new OAuth service", () => {
    expect(isOAuthAuthorizationMissing(mcpForm())).toBe(true);
  });

  it("is satisfied by an authorization made for the current server URL", () => {
    expect(
      isOAuthAuthorizationMissing(
        mcpForm({ oauthAuthorizationId: "auth-1", oauthAuthorizedUrl: SERVER_URL })
      )
    ).toBe(false);
  });

  it("asks again once the server URL changes after authorizing", () => {
    expect(
      isOAuthAuthorizationMissing(
        mcpForm({
          serverUrl: "https://mcp.notion.com/mcp",
          oauthAuthorizationId: "auth-1",
          oauthAuthorizedUrl: SERVER_URL
        })
      )
    ).toBe(true);
  });

  it("keeps a stored authorization while the server URL is unchanged", () => {
    expect(isOAuthAuthorizationMissing(mcpForm(), storedOAuthService())).toBe(false);
    expect(
      isOAuthAuthorizationMissing(
        mcpForm({ serverUrl: "https://mcp.linear.app/v2" }),
        storedOAuthService()
      )
    ).toBe(true);
  });

  it("ignores bearer credentials", () => {
    expect(
      isOAuthAuthorizationMissing(mcpForm({ credentialType: AgentVaultCredentialType.Bearer }))
    ).toBe(false);
  });
});

describe("newOAuthAuthorizationId", () => {
  it("returns the authorization made for the current server URL", () => {
    expect(
      newOAuthAuthorizationId(
        mcpForm({
          serverUrl: ` ${SERVER_URL} `,
          oauthAuthorizationId: "auth-1",
          oauthAuthorizedUrl: SERVER_URL
        })
      )
    ).toBe("auth-1");
  });

  it("drops an authorization made for another server URL", () => {
    expect(
      newOAuthAuthorizationId(
        mcpForm({
          serverUrl: "https://mcp.notion.com/mcp",
          oauthAuthorizationId: "auth-1",
          oauthAuthorizedUrl: SERVER_URL
        })
      )
    ).toBeUndefined();
  });

  it("returns nothing before authorizing", () => {
    expect(newOAuthAuthorizationId(mcpForm())).toBeUndefined();
  });
});

describe("storedOAuthCredential", () => {
  it("returns the stored credential while the server URL matches", () => {
    const service = storedOAuthService();
    expect(storedOAuthCredential(service, ` ${SERVER_URL} `)).toBe(service.credential);
  });

  it("returns null once the server URL changes", () => {
    expect(storedOAuthCredential(storedOAuthService(), "https://mcp.linear.app/v2")).toBeNull();
  });

  it("returns null for a bearer service or no service", () => {
    const bearer = {
      ...storedOAuthService(),
      credential: {
        type: AgentVaultCredentialType.Bearer,
        headerName: "Authorization",
        headerPrefix: "Bearer"
      }
    } satisfies TAgentVaultService;
    expect(storedOAuthCredential(bearer, SERVER_URL)).toBeNull();
    expect(storedOAuthCredential(undefined, SERVER_URL)).toBeNull();
  });
});

describe("oauthStatusLabel", () => {
  const authorized = { oauthAuthorizationId: "auth-1", oauthAuthorizedUrl: SERVER_URL };

  it("labels a new authorization", () => {
    expect(oauthStatusLabel(mcpForm(authorized))).toBe("Authorized");
    expect(oauthStatusLabel(mcpForm(authorized), storedOAuthService())).toBe("Reauthorized");
  });

  it("falls back to the stored status, then to not authorized", () => {
    expect(oauthStatusLabel(mcpForm(), storedOAuthService())).toBe("Needs Reauthorization");
    expect(oauthStatusLabel(mcpForm())).toBe("Not authorized");
  });
});

describe("buildServiceSchema with OAuth", () => {
  it("blocks an unauthorized OAuth service on the authorization field only", () => {
    const result = buildServiceSchema().safeParse(mcpForm());
    expect(result.success).toBe(false);
    const paths = result.error?.issues.map((issue) => issue.path.join(".")) ?? [];
    expect(paths).toEqual(["oauthAuthorizationId"]);
  });

  it("accepts an authorized OAuth service without a token", () => {
    const result = buildServiceSchema().safeParse(
      mcpForm({ oauthAuthorizationId: "auth-1", oauthAuthorizedUrl: SERVER_URL })
    );
    expect(result.success).toBe(true);
  });

  it("validates manual client credentials in the service form", () => {
    const result = buildServiceSchema(storedOAuthService()).safeParse(
      mcpForm({ oauthClientId: "x".repeat(513), oauthClientSecret: "x".repeat(1025) })
    );
    expect(result.error?.issues.map((issue) => issue.path.join("."))).toEqual([
      "oauthClientId",
      "oauthClientSecret"
    ]);
  });

  it("ignores the bearer header fields and reserves Authorization for the token", () => {
    const authorized = { oauthAuthorizationId: "auth-1", oauthAuthorizedUrl: SERVER_URL };
    expect(
      buildServiceSchema().safeParse(mcpForm({ ...authorized, headerName: "Host" })).success
    ).toBe(true);
    const clash = buildServiceSchema().safeParse(
      mcpForm({
        ...authorized,
        headerName: "X-Api-Key",
        customHeaders: [{ name: "Authorization", prefix: "", value: "v" }]
      })
    );
    expect(clash.error?.issues.map((issue) => issue.path.join("."))).toEqual([
      "customHeaders.0.name"
    ]);
  });
});
