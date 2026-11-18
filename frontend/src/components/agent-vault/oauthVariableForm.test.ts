import { describe, expect, it } from "vitest";

import {
  AgentVaultOauthClientAuthMethod,
  AgentVaultOauthStatus,
  AgentVaultVariableType
} from "@app/hooks/api/agentVault";
import { TAgentVaultOauthVariable } from "@app/hooks/api/agentVault/types";

import {
  applySignInPrefill,
  BLANK_OAUTH_VARIABLE_FORM,
  parseOAuthScopes,
  buildOAuthVariableSettings,
  buildOAuthVariableSettingsUpdate,
  changedVariableFormFields,
  hasCommaSeparatedScope,
  isOAuthClientSecretRequired,
  isOAuthVariableSignInChanged,
  oauthVariableFormIssues,
  oauthVariableFormValuesOf,
  TOAuthVariableFormValues
} from "./oauthVariableForm";

const values = (overrides: Partial<TOAuthVariableFormValues> = {}): TOAuthVariableFormValues => ({
  ...BLANK_OAUTH_VARIABLE_FORM,
  serverUrl: "https://mcp.example.com/mcp",
  ...overrides
});

const fieldsOf = (form: TOAuthVariableFormValues) =>
  oauthVariableFormIssues(form).map((issue) => issue.field);

const stored: TAgentVaultOauthVariable = {
  status: AgentVaultOauthStatus.Connected,
  serverUrl: "https://mcp.example.com/mcp",
  issuer: null,
  authorizationEndpoint: null,
  tokenEndpoint: null,
  clientId: null,
  registration: "dynamic",
  tokenEndpointAuthMethod: null,
  scopes: ["read"],
  resource: null,
  clientName: null,
  redirectUri: null,
  connection: null
};

describe("oauthVariableFormIssues", () => {
  it("accepts a server URL alone", () => {
    expect(fieldsOf(values())).toEqual([]);
  });

  it("asks for a server URL or both endpoints", () => {
    expect(fieldsOf(values({ serverUrl: "" }))).toEqual(["serverUrl"]);
    expect(fieldsOf(values({ tokenEndpoint: "https://auth.example.com/token" }))).toEqual([
      "authorizationEndpoint"
    ]);
  });

  it("needs a client ID and a scope for a provider set up by hand", () => {
    expect(
      fieldsOf(
        values({
          serverUrl: "",
          authorizationEndpoint: "https://auth.example.com/authorize",
          tokenEndpoint: "https://auth.example.com/token"
        })
      )
    ).toEqual(["clientId", "scopes"]);
  });

  it("refuses a URL that isn't https and an issuer without endpoints", () => {
    expect(fieldsOf(values({ serverUrl: "http://mcp.example.com" }))).toEqual(["serverUrl"]);
    expect(fieldsOf(values({ issuer: "https://auth.example.com" }))).toEqual(["issuer"]);
  });

  it("ties a secret and an auth method to a client ID", () => {
    expect(
      fieldsOf(
        values({
          clientSecret: "secret",
          tokenEndpointAuthMethod: AgentVaultOauthClientAuthMethod.ClientSecretPost
        })
      )
    ).toEqual(["clientId", "tokenEndpointAuthMethod"]);
  });
});

describe("parseOAuthScopes", () => {
  it("splits on whitespace only, since a scope can contain commas", () => {
    expect(parseOAuthScopes("a,b  c\nc")).toEqual(["a,b", "c"]);
  });
});

describe("hasCommaSeparatedScope", () => {
  it("flags a scope that ends with a comma", () => {
    expect(hasCommaSeparatedScope("read, write")).toBe(true);
    expect(hasCommaSeparatedScope("read write a,b")).toBe(false);
  });
});

describe("buildOAuthVariableSettings", () => {
  it("sends what was typed, never the client secret, and endpoints only by hand", () => {
    expect(
      buildOAuthVariableSettings(
        values({ scopes: "read\n write read", clientId: " app ", clientSecret: "s", issuer: "" })
      )
    ).toEqual({
      serverUrl: "https://mcp.example.com/mcp",
      clientId: "app",
      scopes: ["read", "write"]
    });
  });
});

describe("buildOAuthVariableSettingsUpdate", () => {
  it("sends only what changed, with null for a cleared setting", () => {
    expect(buildOAuthVariableSettingsUpdate(stored, oauthVariableFormValuesOf(stored))).toBe(
      undefined
    );
    expect(
      buildOAuthVariableSettingsUpdate(
        { ...stored, clientName: "Acme" },
        values({ scopes: "read write" })
      )
    ).toEqual({ clientName: null, scopes: ["read", "write"] });
  });

  it("clears the resource when the endpoints are cleared for discovery", () => {
    const manual: TAgentVaultOauthVariable = {
      ...stored,
      serverUrl: null,
      authorizationEndpoint: "https://auth.example.com/authorize",
      tokenEndpoint: "https://auth.example.com/token",
      clientId: "app",
      registration: "manual",
      resource: "https://mcp.example.com/mcp"
    };
    expect(
      buildOAuthVariableSettingsUpdate(manual, values({ clientId: "app", scopes: "read" }))
    ).toEqual({
      serverUrl: "https://mcp.example.com/mcp",
      authorizationEndpoint: null,
      tokenEndpoint: null,
      resource: null
    });
    expect(
      buildOAuthVariableSettingsUpdate(
        manual,
        values({
          serverUrl: "",
          authorizationEndpoint: "https://auth.example.com/authorize",
          tokenEndpoint: "https://auth.example.com/token/v2",
          clientId: "app",
          scopes: "read"
        })
      )
    ).toEqual({ tokenEndpoint: "https://auth.example.com/token/v2" });
  });
});

describe("isOAuthVariableSignInChanged", () => {
  const withClient = { ...stored, clientId: "client-1", registration: "manual" as const };

  it("is false when only settings that shape the next sign-in change", () => {
    expect(
      isOAuthVariableSignInChanged(
        withClient,
        values({ clientId: "client-1", scopes: "read write", clientName: "Acme" })
      )
    ).toBe(false);
  });

  it("is true when a setting the sign-in is bound to changes", () => {
    expect(
      isOAuthVariableSignInChanged(
        withClient,
        values({ clientId: "client-1", scopes: "read", serverUrl: "https://other.example.com/mcp" })
      )
    ).toBe(true);
    expect(isOAuthVariableSignInChanged(withClient, values({ scopes: "read" }))).toBe(true);
    expect(
      isOAuthVariableSignInChanged(
        withClient,
        values({
          clientId: "client-1",
          scopes: "read",
          tokenEndpointAuthMethod: AgentVaultOauthClientAuthMethod.ClientSecretPost
        })
      )
    ).toBe(true);
  });
});

describe("isOAuthClientSecretRequired", () => {
  const ownApp: TAgentVaultOauthVariable = {
    ...stored,
    clientId: "client-1",
    registration: "manual",
    tokenEndpointAuthMethod: AgentVaultOauthClientAuthMethod.ClientSecretBasic
  };
  const edit = (overrides: Partial<TOAuthVariableFormValues> = {}) =>
    values({
      clientId: "client-1",
      scopes: "read",
      tokenEndpointAuthMethod: AgentVaultOauthClientAuthMethod.ClientSecretBasic,
      ...overrides
    });

  it("asks for the secret again when a sign-in setting changes", () => {
    expect(
      isOAuthClientSecretRequired(ownApp, edit({ serverUrl: "https://other.example.com/mcp" }))
    ).toBe(true);
  });

  it("doesn't ask when nothing the sign-in is bound to changes, or a secret is typed", () => {
    expect(isOAuthClientSecretRequired(ownApp, edit({ scopes: "read write" }))).toBe(false);
    expect(
      isOAuthClientSecretRequired(
        ownApp,
        edit({ serverUrl: "https://other.example.com/mcp", clientSecret: "s" })
      )
    ).toBe(false);
  });

  it("doesn't ask for an app without a secret", () => {
    expect(
      isOAuthClientSecretRequired(
        ownApp,
        edit({
          serverUrl: "https://other.example.com/mcp",
          tokenEndpointAuthMethod: AgentVaultOauthClientAuthMethod.None
        })
      )
    ).toBe(false);
    expect(
      isOAuthClientSecretRequired(stored, values({ serverUrl: "https://other.example.com/mcp" }))
    ).toBe(false);
  });

  it("asks for a variable that isn't connected, which has no stored secret", () => {
    const disconnected = { ...ownApp, status: AgentVaultOauthStatus.NotConnected };
    expect(isOAuthClientSecretRequired(disconnected, edit({}))).toBe(true);
    expect(isOAuthClientSecretRequired(disconnected, edit({ clientSecret: "s" }))).toBe(false);
  });

  it("doesn't ask when the method is Automatic, since the app may be public", () => {
    const automatic = { ...ownApp, tokenEndpointAuthMethod: null };
    expect(
      isOAuthClientSecretRequired(
        automatic,
        edit({ serverUrl: "https://other.example.com/mcp", tokenEndpointAuthMethod: "" })
      )
    ).toBe(false);
  });
});

describe("applySignInPrefill", () => {
  it("fills only the empty fields", () => {
    expect(
      applySignInPrefill(values({ scopes: "mine" }), {
        authorizationEndpoint: "https://a.example.com/authorize",
        tokenEndpoint: "https://a.example.com/token",
        issuer: null,
        scopes: ["read"]
      })
    ).toEqual({
      authorizationEndpoint: "https://a.example.com/authorize",
      tokenEndpoint: "https://a.example.com/token"
    });
  });
});

describe("changedVariableFormFields", () => {
  it("lists the fields typed after a save, so they stay changes", () => {
    const saved = {
      ...values(),
      type: AgentVaultVariableType.OAuth,
      key: "LINEAR",
      value: ""
    };
    expect(changedVariableFormFields(saved, saved)).toEqual([]);
    expect(
      changedVariableFormFields(saved, { ...saved, key: "LINEAR_MCP", scopes: "read" })
    ).toEqual(["scopes", "key"]);
  });
});
