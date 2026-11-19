import crypto from "node:crypto";

import {
  AgentVaultOauthClientAuthMethod,
  AgentVaultOauthRegistration
} from "../agent-vault-oauth/agent-vault-oauth-types";
import {
  describeOauthVariableSettingsProblem,
  isOauthVariableClientChanged,
  isOauthVariableSignInChanged,
  mergeOauthVariableSettings,
  OAUTH_VARIABLE_SIGN_IN_FIELDS,
  oauthVariableIssuerOf,
  oauthVariableSettingsFingerprintOf,
  oauthVariableSignInSettingsOf,
  toOauthVariableSettings
} from "./agent-vault-oauth-variable-fns";
import { TAgentVaultOauthVariableSettings } from "./agent-vault-variable-types";

const manual = toOauthVariableSettings({
  authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenEndpoint: "https://oauth2.googleapis.com/token",
  clientId: "client-1",
  tokenEndpointAuthMethod: AgentVaultOauthClientAuthMethod.ClientSecretPost,
  scopes: ["openid"]
});

const discovered = toOauthVariableSettings({ serverUrl: "https://mcp.example.com/mcp" });

describe("toOauthVariableSettings", () => {
  test("registration follows the client ID", () => {
    expect(manual.registration).toBe(AgentVaultOauthRegistration.Manual);
    expect(discovered.registration).toBe(AgentVaultOauthRegistration.Dynamic);
  });
});

describe("describeOauthVariableSettingsProblem", () => {
  test("accepts a provider set up by hand and one that is discovered", () => {
    expect(describeOauthVariableSettingsProblem(manual)).toBeNull();
    expect(describeOauthVariableSettingsProblem(discovered)).toBeNull();
  });

  test.each([
    ["only one endpoint", { tokenEndpoint: null }, "tokenEndpoint"],
    ["no server URL or endpoints", { authorizationEndpoint: null, tokenEndpoint: null }, "serverUrl"],
    ["endpoints by hand without a client", { clientId: null, tokenEndpointAuthMethod: null }, "clientId"],
    ["endpoints by hand without a scope", { scopes: [] as string[] }, "scopes"]
  ] as const)("refuses %s", (_name, change, field) => {
    expect(describeOauthVariableSettingsProblem(mergeOauthVariableSettings(manual, change))?.field).toBe(field);
  });

  test.each([
    ["an issuer", { issuer: "https://mcp.example.com" }, "issuer"],
    ["a resource", { resource: "https://mcp.example.com" }, "resource"],
    [
      "an auth method without a client",
      { tokenEndpointAuthMethod: AgentVaultOauthClientAuthMethod.None },
      "tokenEndpointAuthMethod"
    ]
  ] as const)("refuses %s alongside discovery", (_name, change, field) => {
    expect(describeOauthVariableSettingsProblem(mergeOauthVariableSettings(discovered, change))?.field).toBe(field);
  });
});

describe("mergeOauthVariableSettings", () => {
  test("null clears a field, omitted keeps it, and registration is derived again", () => {
    const merged = mergeOauthVariableSettings(manual, { clientId: null, tokenEndpointAuthMethod: null });

    expect(merged.clientId).toBeNull();
    expect(merged.tokenEndpointAuthMethod).toBeNull();
    expect(merged.tokenEndpoint).toBe(manual.tokenEndpoint);
    expect(merged.registration).toBe(AgentVaultOauthRegistration.Dynamic);
  });
});

describe("isOauthVariableSignInChanged", () => {
  const changeOf: Record<(typeof OAUTH_VARIABLE_SIGN_IN_FIELDS)[number], Partial<TAgentVaultOauthVariableSettings>> = {
    serverUrl: { serverUrl: "https://mcp.example.com/mcp" },
    issuer: { issuer: "https://accounts.example.com" },
    authorizationEndpoint: { authorizationEndpoint: "https://login.example.com/authorize" },
    tokenEndpoint: { tokenEndpoint: "https://login.example.com/token" },
    clientId: { clientId: "client-2" },
    registration: { registration: AgentVaultOauthRegistration.Dynamic },
    tokenEndpointAuthMethod: { tokenEndpointAuthMethod: AgentVaultOauthClientAuthMethod.ClientSecretBasic },
    resource: { resource: "https://api.example.com" }
  };

  test.each(OAUTH_VARIABLE_SIGN_IN_FIELDS)("a change to %s disconnects", (field) => {
    expect(isOauthVariableSignInChanged(manual, { ...manual, ...changeOf[field] })).toBe(true);
  });

  test("scopes, the client name and the redirect URI keep the tokens", () => {
    expect(
      isOauthVariableSignInChanged(manual, {
        ...manual,
        scopes: ["openid", "email"],
        clientName: "Acme Assistant",
        redirectUri: "https://app.example.com/oauth/callback"
      })
    ).toBe(false);
  });
});

describe("oauthVariableIssuerOf", () => {
  test("defaults to the authorization endpoint's origin, never the token endpoint's", () => {
    expect(oauthVariableIssuerOf(manual)).toBe("https://accounts.google.com");
  });

  test("an issuer sent wins, and a discovered provider has none until discovery", () => {
    expect(oauthVariableIssuerOf({ ...manual, issuer: "https://issuer.example.com" })).toBe(
      "https://issuer.example.com"
    );
    expect(oauthVariableIssuerOf(discovered)).toBeNull();
  });
});

describe("oauthVariableSettingsFingerprintOf", () => {
  test("no disconnects hashes the sign-in settings alone, so sign-ins started before the count existed still match", () => {
    const legacy = crypto
      .createHash("sha256")
      .update(JSON.stringify(oauthVariableSignInSettingsOf(manual)))
      .digest("hex");
    expect(oauthVariableSettingsFingerprintOf(manual)).toBe(legacy);
    expect(oauthVariableSettingsFingerprintOf(manual, 0)).toBe(legacy);
  });

  test("a disconnect changes it even when the settings are the same", () => {
    expect(oauthVariableSettingsFingerprintOf(manual, 1)).not.toBe(oauthVariableSettingsFingerprintOf(manual));
    expect(oauthVariableSettingsFingerprintOf(manual, 2)).not.toBe(oauthVariableSettingsFingerprintOf(manual, 1));
  });
});

describe("isOauthVariableClientChanged", () => {
  test("only the client's own settings count", () => {
    expect(isOauthVariableClientChanged(manual, { ...manual, scopes: ["email"], issuer: "https://x.test" })).toBe(
      false
    );
    expect(isOauthVariableClientChanged(manual, { ...manual, clientId: "client-2" })).toBe(true);
    expect(isOauthVariableClientChanged(manual, { ...manual, tokenEndpoint: "https://login.example.com/token" })).toBe(
      true
    );
    expect(isOauthVariableClientChanged(manual, { ...manual, tokenEndpointAuthMethod: null })).toBe(true);
  });
});
