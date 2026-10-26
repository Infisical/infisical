import { describe, expect, it } from "vitest";

import {
  AgentVaultCredentialType,
  AgentVaultMcpTransport,
  AgentVaultOauthStatus,
  AgentVaultServiceType
} from "@app/hooks/api/agentVault";
import { TAgentVaultService } from "@app/hooks/api/agentVault/types";

import {
  buildServiceSchema,
  isOAuthAuthorizationMissing,
  newOAuthAuthorizationId,
  OAUTH_CLIENT_VARIABLES_MESSAGE,
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
  memberProvidedFields: [],
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
    serverUrl,
    transport: AgentVaultMcpTransport.StreamableHttp,
    allowedMethods: null,
    allowedPathPrefixes: null,
    credential: {
      type: AgentVaultCredentialType.OAuth,
      status: AgentVaultOauthStatus.NeedsReauthorization,
      issuer: "https://mcp.linear.app",
      grantedScopes: ["read"],
      requiredScopes: [],
      expiresAt: null,
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
    expect(serverUrlError("https://*.example.com/mcp")).toMatch(/not a wildcard/);
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
        headerPrefix: "Bearer",
        memberProvidedFields: []
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

  it("calls a working stored authorization Authorized, the word the card uses", () => {
    const service = storedOAuthService();
    const working = {
      ...service,
      credential: { ...service.credential, status: AgentVaultOauthStatus.Connected }
    } as TAgentVaultService;
    expect(oauthStatusLabel(mcpForm(), working)).toBe("Authorized");
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
      mcpForm({ oauthClientId: "x".repeat(2049), oauthClientSecret: "x".repeat(4097) })
    );
    expect(result.error?.issues.map((issue) => issue.path.join("."))).toEqual([
      "oauthClientId",
      "oauthClientSecret"
    ]);
  });

  it("refuses a variable reference in the client ID or secret, which are sent as typed", () => {
    const result = buildServiceSchema(storedOAuthService()).safeParse(
      mcpForm({
        oauthClientId: "{{GITHUB_CLIENT_ID}}",
        oauthClientSecret: "{{GITHUB_CLIENT_SECRET}}"
      })
    );
    expect(result.error?.issues.map(({ path, message }) => [path.join("."), message])).toEqual([
      ["oauthClientId", OAUTH_CLIENT_VARIABLES_MESSAGE],
      ["oauthClientSecret", OAUTH_CLIENT_VARIABLES_MESSAGE]
    ]);
  });

  it("refuses a client ID or secret the API would refuse, such as one with a pasted smart quote", () => {
    const result = buildServiceSchema(storedOAuthService()).safeParse(
      mcpForm({ oauthClientId: "\u201cclient-1\u201d", oauthClientSecret: "line\nbreak" })
    );
    expect(result.error?.issues.map((issue) => issue.path.join("."))).toEqual([
      "oauthClientId",
      "oauthClientSecret"
    ]);
  });

  it("ignores leftover client values once the service switches to a bearer token", () => {
    const result = buildServiceSchema(storedOAuthService()).safeParse(
      mcpForm({
        credentialType: AgentVaultCredentialType.Bearer,
        secret: "token",
        oauthClientId: "{{GITHUB_CLIENT_ID}}",
        oauthClientSecret: "\u201csecret\u201d"
      })
    );
    expect(result.success).toBe(true);
  });

  it("refuses to save an existing service whose new authorization expired, until it is reauthorized or kept", () => {
    const schema = buildServiceSchema(storedOAuthService());
    const expired = schema.safeParse(
      mcpForm({
        oauthAuthorizationRejection: "This authorization expired before the service was saved."
      })
    );
    expect(expired.error?.issues.map(({ path, message }) => [path.join("."), message])).toEqual([
      ["oauthAuthorizationId", "This authorization expired before the service was saved."]
    ]);

    expect(schema.safeParse(mcpForm({ oauthAuthorizationRejection: "" })).success).toBe(true);
    expect(
      schema.safeParse(
        mcpForm({
          oauthAuthorizationRejection: "This authorization expired before the service was saved.",
          oauthAuthorizationId: "auth-2",
          oauthAuthorizedUrl: SERVER_URL
        })
      ).success
    ).toBe(true);
  });

  it("ignores the bearer header fields and reserves Authorization for the token", () => {
    const authorized = { oauthAuthorizationId: "auth-1", oauthAuthorizedUrl: SERVER_URL };
    expect(
      buildServiceSchema().safeParse(mcpForm({ ...authorized, headerName: "Host" })).success
    ).toBe(true);
    expect(
      buildServiceSchema().safeParse(
        mcpForm({ ...authorized, headerName: "X Api Key", headerPrefix: "p".repeat(65) })
      ).success
    ).toBe(true);
    const bearer = buildServiceSchema().safeParse(
      mcpForm({
        credentialType: AgentVaultCredentialType.Bearer,
        secret: "token",
        headerName: "X Api Key",
        headerPrefix: "p".repeat(65)
      })
    );
    expect(bearer.error?.issues.map((issue) => issue.path.join("."))).toEqual([
      "headerName",
      "headerPrefix"
    ]);
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
