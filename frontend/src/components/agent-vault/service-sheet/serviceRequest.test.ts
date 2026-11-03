import { describe, expect, it } from "vitest";

import {
  AgentVaultCredentialType,
  AgentVaultHttpMethod,
  AgentVaultMcpTransport,
  AgentVaultServiceType,
  AgentVaultSubstitutionSurface
} from "@app/hooks/api/agentVault";

import {
  buildCreateServiceRequest,
  buildListMcpToolsRequest,
  buildUpdateServiceRequest
} from "./serviceRequest";
import { HTTP_METHODS, McpToolScope, TServiceForm, UNCHANGED_SECRET } from "./serviceSchema";

const SERVER_URL = "https://mcp.linear.app/mcp";

const form = (overrides: Partial<TServiceForm> = {}): TServiceForm => ({
  serviceType: AgentVaultServiceType.Http,
  name: "stripe",
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
      value: "lin_api"
    });
  });
});

describe("buildUpdateServiceRequest", () => {
  it("omits untouched secrets and keeps row ids", () => {
    expect(
      buildUpdateServiceRequest(
        "bundle-1",
        "service-1",
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
      buildUpdateServiceRequest("bundle-1", "service-1", form({ secret: "", headerName: "" }))
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
        "service-1",
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
    expect(buildUpdateServiceRequest("bundle-1", "service-1", mcpForm())).toEqual({
      accessBundleId: "bundle-1",
      serviceId: "service-1",
      type: AgentVaultServiceType.Mcp,
      name: "linear-mcp",
      serverUrl: SERVER_URL,
      transport: AgentVaultMcpTransport.StreamableHttp,
      allowedTools: null,
      customHeaders: []
    });
    expect(
      buildUpdateServiceRequest(
        "bundle-1",
        "service-1",
        mcpForm({ oauthAuthorizationId: "auth-2", oauthAuthorizedUrl: "https://other.example/mcp" })
      )
    ).not.toHaveProperty("credential");
    expect(
      buildUpdateServiceRequest(
        "bundle-1",
        "service-1",
        mcpForm({ oauthAuthorizationId: "auth-2", oauthAuthorizedUrl: SERVER_URL })
      ).credential
    ).toEqual({ type: AgentVaultCredentialType.OAuth, authorizationId: "auth-2" });
  });

  it("clears allowed tools with null, sends a changed list, and never sends them for HTTP", () => {
    expect(
      buildUpdateServiceRequest(
        "bundle-1",
        "service-1",
        mcpForm({ toolScope: McpToolScope.Selected, allowedTools: ["read_file"] })
      )
    ).toMatchObject({ allowedTools: ["read_file"] });
    expect(buildUpdateServiceRequest("bundle-1", "service-1", mcpForm())).toMatchObject({
      allowedTools: null
    });
    expect(
      buildUpdateServiceRequest(
        "bundle-1",
        "service-1",
        form({ toolScope: McpToolScope.Selected, allowedTools: ["read_file"] })
      )
    ).not.toHaveProperty("allowedTools");
  });

  it("never sends a header name or prefix for OAuth", () => {
    expect(
      buildUpdateServiceRequest(
        "bundle-1",
        "service-1",
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
});
