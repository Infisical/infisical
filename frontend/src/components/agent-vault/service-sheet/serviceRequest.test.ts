import { describe, expect, it } from "vitest";

import {
  AgentVaultCredentialType,
  AgentVaultHttpMethod,
  AgentVaultMcpTransport,
  AgentVaultOauthStatus,
  AgentVaultServiceType,
  AgentVaultSubstitutionSurface,
  AgentVaultVariableReferenceField
} from "@app/hooks/api/agentVault";
import { TAgentVaultCredentialSummary, TAgentVaultService } from "@app/hooks/api/agentVault/types";

import {
  buildCreateServiceRequest,
  buildListMcpToolsRequest,
  buildUpdateServiceRequest,
  membersClearedNotice
} from "./serviceRequest";
import { HTTP_METHODS, McpToolScope, TServiceForm, UNCHANGED_SECRET } from "./serviceSchema";

const SERVER_URL = "https://mcp.linear.app/mcp";

const form = (overrides: Partial<TServiceForm> = {}): TServiceForm => ({
  serviceType: AgentVaultServiceType.Http,
  name: "stripe",
  description: "",
  serverUrl: "",
  transport: AgentVaultMcpTransport.StreamableHttp,
  hosts: ["api.stripe.com"],
  hostDraft: "",
  pathDraft: "",
  toolScope: McpToolScope.All,
  allowedTools: [],
  credentialType: AgentVaultCredentialType.Bearer,
  headerName: "Authorization",
  headerPrefix: "Bearer",
  username: "",
  secret: "sk_test",
  oauthAuthorizationId: "",
  oauthAuthorizedUrl: "",
  oauthScopes: [],
  memberProvidedFields: [],
  methods: [...HTTP_METHODS],
  pathPrefixes: [],
  customHeaders: [],
  substitutions: [],
  ...overrides
});

const mcpForm = (overrides: Partial<TServiceForm> = {}) =>
  form({
    serviceType: AgentVaultServiceType.Mcp,
    name: "linear-mcp",
    serverUrl: ` ${SERVER_URL} `,
    hosts: [],
    credentialType: AgentVaultCredentialType.OAuth,
    secret: "",
    ...overrides
  });

describe("buildCreateServiceRequest", () => {
  it("builds an HTTP service with its policy and transformations", () => {
    expect(
      buildCreateServiceRequest(
        "bundle-1",
        form({
          hosts: ["api.stripe.com", "files.stripe.com"],
          methods: [AgentVaultHttpMethod.Get],
          pathPrefixes: ["/v1"],
          headerName: "",
          customHeaders: [{ name: "X-Org", prefix: "", value: "acme" }],
          substitutions: [
            {
              placeholder: "ACCOUNT",
              value: "acct_1",
              surfaces: [AgentVaultSubstitutionSurface.Path]
            }
          ]
        })
      )
    ).toEqual({
      accessBundleId: "bundle-1",
      type: AgentVaultServiceType.Http,
      name: "stripe",
      hostPattern: "api.stripe.com,files.stripe.com",
      allowedMethods: [AgentVaultHttpMethod.Get],
      allowedPathPrefixes: ["/v1"],
      credential: {
        type: AgentVaultCredentialType.Bearer,
        headerName: undefined,
        headerPrefix: "Bearer",
        value: "sk_test",
        memberProvidedFields: []
      },
      customHeaders: [{ name: "X-Org", prefix: "", value: "acme" }],
      substitutions: [
        { placeholder: "ACCOUNT", value: "acct_1", surfaces: [AgentVaultSubstitutionSurface.Path] }
      ]
    });
  });

  it("sends null for every method and no path prefixes", () => {
    const request = buildCreateServiceRequest("bundle-1", form());
    expect(request).toMatchObject({ allowedMethods: null, allowedPathPrefixes: null });
  });

  it("sends a trimmed description for either type, and leaves a blank one out", () => {
    expect(
      buildCreateServiceRequest("bundle-1", form({ description: " Payments, read only " }))
    ).toMatchObject({ description: "Payments, read only" });
    expect(
      buildCreateServiceRequest(
        "bundle-1",
        mcpForm({ description: "Issues for the platform team" })
      )
    ).toMatchObject({ description: "Issues for the platform team" });
    expect(buildCreateServiceRequest("bundle-1", form({ description: "  " })).description).toBe(
      undefined
    );
  });

  it("builds basic and pass-through credentials", () => {
    expect(
      buildCreateServiceRequest(
        "bundle-1",
        form({ credentialType: AgentVaultCredentialType.Basic, username: "me", secret: "pw" })
      ).credential
    ).toEqual({
      type: AgentVaultCredentialType.Basic,
      username: "me",
      password: "pw",
      memberProvidedFields: []
    });
    expect(
      buildCreateServiceRequest(
        "bundle-1",
        form({ credentialType: AgentVaultCredentialType.Passthrough })
      ).credential
    ).toEqual({ type: AgentVaultCredentialType.Passthrough });
  });

  it("builds an MCP service with the authorization made for its URL", () => {
    expect(
      buildCreateServiceRequest(
        "bundle-1",
        mcpForm({
          oauthAuthorizationId: "auth-1",
          oauthAuthorizedUrl: SERVER_URL,
          oauthClientId: "client-id",
          oauthClientSecret: "client-secret"
        })
      )
    ).toEqual({
      accessBundleId: "bundle-1",
      type: AgentVaultServiceType.Mcp,
      name: "linear-mcp",
      serverUrl: SERVER_URL,
      transport: AgentVaultMcpTransport.StreamableHttp,
      allowedTools: null,
      customHeaders: [],
      credential: { type: AgentVaultCredentialType.OAuth, authorizationId: "auth-1" }
    });
  });

  it("sends the selected tools for an MCP service, and null for all tools even with picks kept", () => {
    expect(
      buildCreateServiceRequest(
        "bundle-1",
        mcpForm({ toolScope: McpToolScope.Selected, allowedTools: ["read_file", "list_issues"] })
      )
    ).toMatchObject({ allowedTools: ["read_file", "list_issues"] });
    expect(
      buildCreateServiceRequest(
        "bundle-1",
        mcpForm({ toolScope: McpToolScope.All, allowedTools: ["read_file"] })
      )
    ).toMatchObject({ allowedTools: null });
  });

  it("never sends allowed tools for an HTTP service", () => {
    expect(
      buildCreateServiceRequest(
        "bundle-1",
        form({ toolScope: McpToolScope.Selected, allowedTools: ["read_file"] })
      )
    ).not.toHaveProperty("allowedTools");
  });

  it("sends an empty authorization when it was made for another URL", () => {
    const request = buildCreateServiceRequest(
      "bundle-1",
      mcpForm({ oauthAuthorizationId: "auth-1", oauthAuthorizedUrl: "https://other.example/mcp" })
    );
    expect(request.credential).toMatchObject({ authorizationId: "" });
  });

  it("builds an MCP bearer credential", () => {
    expect(
      buildCreateServiceRequest(
        "bundle-1",
        mcpForm({ credentialType: AgentVaultCredentialType.Bearer, secret: "lin_api" })
      ).credential
    ).toEqual({
      type: AgentVaultCredentialType.Bearer,
      headerName: "Authorization",
      headerPrefix: "Bearer",
      value: "lin_api",
      memberProvidedFields: []
    });
  });
});

const MEMBER = [AgentVaultVariableReferenceField.CredentialValue as const];

const storedMcp = (credential: TAgentVaultCredentialSummary): TAgentVaultService => ({
  id: "service-1",
  accessBundleId: "bundle-1",
  name: "linear-mcp",
  description: null,
  hostPattern: "mcp.linear.app",
  type: AgentVaultServiceType.Mcp,
  serverUrl: SERVER_URL,
  transport: AgentVaultMcpTransport.StreamableHttp,
  allowedMethods: null,
  allowedPathPrefixes: null,
  allowedTools: null,
  credential,
  customHeaders: [],
  substitutions: [],
  createdAt: "2026-10-15T00:00:00.000Z",
  updatedAt: "2026-10-15T00:00:00.000Z"
});

const memberOAuth = (clientId: string | null = null) =>
  storedMcp({
    type: AgentVaultCredentialType.OAuth,
    memberProvidedFields: MEMBER,
    issuer: "https://mcp.linear.app",
    grantedScopes: [],
    requiredScopes: [],
    registration: clientId ? "manual" : "dynamic",
    clientId
  });

const sharedOAuth = storedMcp({
  type: AgentVaultCredentialType.OAuth,
  memberProvidedFields: [],
  status: AgentVaultOauthStatus.Connected,
  issuer: "https://mcp.linear.app",
  grantedScopes: [],
  requiredScopes: []
});

const storedHttp = {
  ...storedMcp({
    type: AgentVaultCredentialType.Bearer,
    headerName: "Authorization",
    headerPrefix: "Bearer",
    memberProvidedFields: []
  }),
  type: AgentVaultServiceType.Http,
  serverUrl: null,
  transport: null
} satisfies TAgentVaultService;

describe("buildUpdateServiceRequest", () => {
  it("omits untouched secrets and keeps row ids", () => {
    expect(
      buildUpdateServiceRequest(
        "bundle-1",
        storedHttp,
        form({
          secret: UNCHANGED_SECRET,
          customHeaders: [{ id: "h-1", name: "X-Org", prefix: "", value: UNCHANGED_SECRET }],
          substitutions: [
            {
              id: "s-1",
              placeholder: "ACCOUNT",
              value: UNCHANGED_SECRET,
              surfaces: [AgentVaultSubstitutionSurface.Path]
            }
          ]
        })
      )
    ).toEqual({
      accessBundleId: "bundle-1",
      serviceId: "service-1",
      type: AgentVaultServiceType.Http,
      name: "stripe",
      description: null,
      hostPattern: "api.stripe.com",
      allowedMethods: null,
      allowedPathPrefixes: null,
      credential: {
        type: AgentVaultCredentialType.Bearer,
        headerName: "Authorization",
        headerPrefix: "Bearer",
        value: undefined,
        memberProvidedFields: []
      },
      customHeaders: [{ id: "h-1", name: "X-Org", prefix: "" }],
      substitutions: [
        { id: "s-1", placeholder: "ACCOUNT", surfaces: [AgentVaultSubstitutionSurface.Path] }
      ]
    });
  });

  it("omits an empty bearer token but sends an emptied basic half", () => {
    expect(
      buildUpdateServiceRequest("bundle-1", storedHttp, form({ secret: "", headerName: "" }))
        .credential
    ).toEqual({
      type: AgentVaultCredentialType.Bearer,
      headerName: "Authorization",
      headerPrefix: "Bearer",
      value: undefined,
      memberProvidedFields: []
    });
    expect(
      buildUpdateServiceRequest(
        "bundle-1",
        storedHttp,
        form({
          credentialType: AgentVaultCredentialType.Basic,
          username: UNCHANGED_SECRET,
          secret: ""
        })
      ).credential
    ).toEqual({
      type: AgentVaultCredentialType.Basic,
      username: undefined,
      password: "",
      memberProvidedFields: []
    });
  });

  it("leaves the OAuth credential out unless a new authorization matches the URL", () => {
    expect(buildUpdateServiceRequest("bundle-1", sharedOAuth, mcpForm())).toEqual({
      accessBundleId: "bundle-1",
      serviceId: "service-1",
      type: AgentVaultServiceType.Mcp,
      name: "linear-mcp",
      description: null,
      serverUrl: SERVER_URL,
      transport: AgentVaultMcpTransport.StreamableHttp,
      allowedTools: null,
      customHeaders: []
    });
    expect(
      buildUpdateServiceRequest(
        "bundle-1",
        sharedOAuth,
        mcpForm({ oauthAuthorizationId: "auth-2", oauthAuthorizedUrl: "https://other.example/mcp" })
      )
    ).not.toHaveProperty("credential");
    expect(
      buildUpdateServiceRequest(
        "bundle-1",
        sharedOAuth,
        mcpForm({ oauthAuthorizationId: "auth-2", oauthAuthorizedUrl: SERVER_URL })
      ).credential
    ).toEqual({ type: AgentVaultCredentialType.OAuth, authorizationId: "auth-2" });
  });

  it("clears allowed tools with null, sends a changed list, and never sends them for HTTP", () => {
    expect(
      buildUpdateServiceRequest(
        "bundle-1",
        sharedOAuth,
        mcpForm({ toolScope: McpToolScope.Selected, allowedTools: ["read_file"] })
      )
    ).toMatchObject({ allowedTools: ["read_file"] });
    expect(buildUpdateServiceRequest("bundle-1", sharedOAuth, mcpForm())).toMatchObject({
      allowedTools: null
    });
    expect(
      buildUpdateServiceRequest(
        "bundle-1",
        storedHttp,
        form({ toolScope: McpToolScope.Selected, allowedTools: ["read_file"] })
      )
    ).not.toHaveProperty("allowedTools");
  });

  it("sends a trimmed description, and null to remove it once the field is cleared", () => {
    expect(
      buildUpdateServiceRequest("bundle-1", storedHttp, form({ description: " Payments " }))
    ).toMatchObject({ description: "Payments" });
    expect(
      buildUpdateServiceRequest("bundle-1", sharedOAuth, mcpForm({ description: "  " }))
    ).toMatchObject({ description: null });
  });

  it("never sends a header name or prefix for OAuth", () => {
    expect(
      buildUpdateServiceRequest(
        "bundle-1",
        sharedOAuth,
        mcpForm({
          headerName: "X-Api-Key",
          headerPrefix: "Token",
          oauthAuthorizationId: "auth-2",
          oauthAuthorizedUrl: SERVER_URL
        })
      ).credential
    ).toEqual({ type: AgentVaultCredentialType.OAuth, authorizationId: "auth-2" });
  });
});

describe("buildListMcpToolsRequest", () => {
  it("sends a typed token and header values for a new service", () => {
    expect(
      buildListMcpToolsRequest(
        "bundle-1",
        undefined,
        mcpForm({
          credentialType: AgentVaultCredentialType.Bearer,
          secret: "{{LINEAR_TOKEN}}",
          transport: AgentVaultMcpTransport.Sse,
          customHeaders: [{ name: "X-Org", prefix: "", value: "acme" }],
          toolScope: McpToolScope.Selected,
          allowedTools: ["read_file"]
        })
      )
    ).toEqual({
      accessBundleId: "bundle-1",
      serverUrl: SERVER_URL,
      transport: AgentVaultMcpTransport.Sse,
      customHeaders: [{ name: "X-Org", prefix: "", value: "acme" }],
      credential: {
        type: AgentVaultCredentialType.Bearer,
        headerName: "Authorization",
        headerPrefix: "Bearer",
        value: "{{LINEAR_TOKEN}}",
        memberProvidedFields: []
      }
    });
  });

  it("leaves untouched values out on edit, so the saved service's are used", () => {
    expect(
      buildListMcpToolsRequest(
        "bundle-1",
        "service-1",
        mcpForm({
          credentialType: AgentVaultCredentialType.Bearer,
          secret: UNCHANGED_SECRET,
          customHeaders: [{ id: "h-1", name: "X-Org", prefix: "", value: UNCHANGED_SECRET }]
        })
      )
    ).toEqual({
      accessBundleId: "bundle-1",
      serviceId: "service-1",
      serverUrl: SERVER_URL,
      transport: AgentVaultMcpTransport.StreamableHttp,
      customHeaders: [{ id: "h-1", name: "X-Org", prefix: "" }],
      credential: {
        type: AgentVaultCredentialType.Bearer,
        headerName: "Authorization",
        headerPrefix: "Bearer",
        value: undefined,
        memberProvidedFields: []
      }
    });
  });

  it("sends a pending OAuth authorization for the current URL, and none otherwise", () => {
    expect(
      buildListMcpToolsRequest(
        "bundle-1",
        undefined,
        mcpForm({ oauthAuthorizationId: "auth-1", oauthAuthorizedUrl: SERVER_URL })
      ).credential
    ).toEqual({ type: AgentVaultCredentialType.OAuth, authorizationId: "auth-1" });
    expect(buildListMcpToolsRequest("bundle-1", "service-1", mcpForm())).not.toHaveProperty(
      "credential"
    );
  });

  it("sends the admin's own token in place of a member-provided one, as a credential set in full", () => {
    expect(
      buildListMcpToolsRequest(
        "bundle-1",
        "service-1",
        mcpForm({
          credentialType: AgentVaultCredentialType.Bearer,
          secret: UNCHANGED_SECRET,
          memberProvidedFields: [AgentVaultVariableReferenceField.CredentialValue]
        }),
        { token: "admin-token" }
      ).credential
    ).toEqual({
      type: AgentVaultCredentialType.Bearer,
      headerName: "Authorization",
      headerPrefix: "Bearer",
      value: "admin-token",
      memberProvidedFields: []
    });
  });

  it("sends the admin's own sign-in in place of a member-provided OAuth credential", () => {
    expect(
      buildListMcpToolsRequest(
        "bundle-1",
        undefined,
        mcpForm({ memberProvidedFields: [AgentVaultVariableReferenceField.CredentialValue] }),
        { authorizationId: "auth-2" }
      ).credential
    ).toEqual({ type: AgentVaultCredentialType.OAuth, authorizationId: "auth-2" });
  });
});

describe("member-provided MCP credentials", () => {
  it("creates a member-provided OAuth service without an authorization, with an optional client", () => {
    expect(
      buildCreateServiceRequest("bundle-1", mcpForm({ memberProvidedFields: MEMBER })).credential
    ).toEqual({ type: AgentVaultCredentialType.OAuth, memberProvidedFields: MEMBER });
    expect(
      buildCreateServiceRequest(
        "bundle-1",
        mcpForm({ memberProvidedFields: MEMBER, oauthClientId: " app ", oauthClientSecret: "s" })
      ).credential
    ).toEqual({
      type: AgentVaultCredentialType.OAuth,
      memberProvidedFields: MEMBER,
      clientId: "app",
      clientSecret: "s"
    });
  });

  it("creates a member-provided bearer token without a value", () => {
    expect(
      buildCreateServiceRequest(
        "bundle-1",
        mcpForm({ credentialType: AgentVaultCredentialType.Bearer, memberProvidedFields: MEMBER })
      ).credential
    ).toMatchObject({
      type: AgentVaultCredentialType.Bearer,
      value: undefined,
      memberProvidedFields: MEMBER
    });
  });

  it("leaves a member-provided OAuth credential out unless its client changes", () => {
    const service = memberOAuth("app");
    const update = (overrides: Partial<TServiceForm>) =>
      buildUpdateServiceRequest(
        "bundle-1",
        service,
        mcpForm({ memberProvidedFields: MEMBER, oauthClientId: "app", ...overrides })
      ).credential;
    expect(update({})).toBeUndefined();
    expect(update({ oauthClientSecret: "new" })).toEqual({
      type: AgentVaultCredentialType.OAuth,
      memberProvidedFields: MEMBER,
      clientId: "app",
      clientSecret: "new"
    });
    expect(update({ oauthClientId: "" })).toEqual({
      type: AgentVaultCredentialType.OAuth,
      memberProvidedFields: MEMBER,
      registration: "dynamic"
    });
  });

  it("hands the sign-in back to the admin with an empty member list", () => {
    expect(
      buildUpdateServiceRequest(
        "bundle-1",
        memberOAuth(),
        mcpForm({ oauthAuthorizationId: "auth-1", oauthAuthorizedUrl: SERVER_URL })
      ).credential
    ).toEqual({
      type: AgentVaultCredentialType.OAuth,
      authorizationId: "auth-1",
      memberProvidedFields: []
    });
  });
});

describe("membersClearedNotice", () => {
  it("names each edit that removes connections or values", () => {
    expect(
      membersClearedNotice(mcpForm({ memberProvidedFields: MEMBER }), sharedOAuth)?.description
    ).toBe(
      "Your connection to mcp.linear.app will be removed. Sessions can't use this service until each member connects their own account."
    );
    expect(membersClearedNotice(mcpForm(), memberOAuth())?.description).toBe(
      "Every member's connection to mcp.linear.app will be removed, and sessions will use your account."
    );
    expect(
      membersClearedNotice(
        mcpForm({ memberProvidedFields: MEMBER, serverUrl: "https://mcp.linear.app/v2" }),
        memberOAuth()
      )?.description
    ).toBe("Every member's connection will be removed. Each member has to connect again.");
    expect(
      membersClearedNotice(
        mcpForm({ credentialType: AgentVaultCredentialType.Bearer }),
        storedMcp({
          type: AgentVaultCredentialType.Bearer,
          headerName: "Authorization",
          headerPrefix: "Bearer",
          memberProvidedFields: MEMBER
        })
      )?.description
    ).toBe(
      "Every member's token for this service will be removed, and sessions will use the token you set."
    );
    expect(
      membersClearedNotice(
        mcpForm({ memberProvidedFields: MEMBER, oauthClientId: "other-app" }),
        memberOAuth("admin-app")
      )?.description
    ).toBe("Every member's connection will be removed. Each member has to connect again.");
    expect(
      membersClearedNotice(
        mcpForm({ credentialType: AgentVaultCredentialType.Bearer, secret: "t" }),
        memberOAuth()
      )?.description
    ).toBe(
      "Every member's connection to mcp.linear.app will be removed, and sessions will use the credential you set."
    );
  });

  it("asks nothing for edits that keep members' values", () => {
    expect(
      membersClearedNotice(mcpForm({ memberProvidedFields: MEMBER }), memberOAuth())
    ).toBeNull();
    expect(membersClearedNotice(mcpForm({ name: "renamed" }), sharedOAuth)).toBeNull();
    expect(membersClearedNotice(mcpForm({ memberProvidedFields: MEMBER }))).toBeNull();
  });
});
