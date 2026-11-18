import crypto from "node:crypto";

import { OauthGrantType } from "@app/services/oauth-client/oauth-client-types";

import { hashAccessToken } from "../agent-vault-oauth/agent-vault-oauth-token-fns";
import {
  AgentVaultOauthClientAuthMethod,
  AgentVaultOauthRegistration,
  TAgentVaultOauthSecret
} from "../agent-vault-oauth/agent-vault-oauth-types";
import { AgentVaultCredentialType, AgentVaultOauthStatus } from "../agent-vault/agent-vault-enums";
import {
  TAgentVaultOauthVariableConfig,
  TAgentVaultOauthVariableConnection,
  TAgentVaultOauthVariableSettings,
  TAgentVaultOauthVariableSettingsInput,
  TAgentVaultOauthVariableSettingsUpdate,
  TAgentVaultOauthVariableTokens
} from "./agent-vault-variable-types";

// The settings a variable's tokens are bound to. Changing any of them disconnects the variable, since the tokens (and
// a client secret, which is sealed with them) belong to the old provider or client. Scopes, the client name and the
// redirect URI only shape the next sign-in.
export const OAUTH_VARIABLE_SIGN_IN_FIELDS = [
  "serverUrl",
  "issuer",
  "authorizationEndpoint",
  "tokenEndpoint",
  "clientId",
  "registration",
  "tokenEndpointAuthMethod",
  "resource"
] as const satisfies readonly (keyof TAgentVaultOauthVariableSettings)[];

export const isManualOauthVariable = (settings: Pick<TAgentVaultOauthVariableSettings, "authorizationEndpoint">) =>
  Boolean(settings.authorizationEndpoint);

export const toOauthVariableSettings = (
  input: TAgentVaultOauthVariableSettingsInput
): TAgentVaultOauthVariableSettings => ({
  serverUrl: input.serverUrl ?? null,
  issuer: input.issuer ?? null,
  authorizationEndpoint: input.authorizationEndpoint ?? null,
  tokenEndpoint: input.tokenEndpoint ?? null,
  clientId: input.clientId ?? null,
  registration: input.clientId ? AgentVaultOauthRegistration.Manual : AgentVaultOauthRegistration.Dynamic,
  tokenEndpointAuthMethod: input.tokenEndpointAuthMethod ?? null,
  scopes: input.scopes ?? [],
  resource: input.resource ?? null,
  clientName: input.clientName ?? null,
  redirectUri: input.redirectUri ?? null
});

export const mergeOauthVariableSettings = (
  current: TAgentVaultOauthVariableSettings,
  update: TAgentVaultOauthVariableSettingsUpdate
): TAgentVaultOauthVariableSettings => {
  const merged: TAgentVaultOauthVariableSettingsInput = { ...current };
  (Object.keys(update) as (keyof TAgentVaultOauthVariableSettingsUpdate)[]).forEach((field) => {
    if (update[field] !== undefined) Object.assign(merged, { [field]: update[field] });
  });
  return toOauthVariableSettings(merged);
};

export const oauthVariableSignInSettingsOf = (settings: TAgentVaultOauthVariableSettings) =>
  Object.fromEntries(OAUTH_VARIABLE_SIGN_IN_FIELDS.map((field) => [field, settings[field]])) as Pick<
    TAgentVaultOauthVariableSettings,
    (typeof OAUTH_VARIABLE_SIGN_IN_FIELDS)[number]
  >;

/**
 * What a sign-in records when it starts and checks against the locked row when it completes: tokens for settings an
 * edit has changed since belong to the old provider or client, and a disconnect since then cancels the sign-in.
 * Scopes, client name and redirect URI don't count, as for a disconnect. A count of 0 leaves the hash as it was before
 * disconnects were counted, so sign-ins already in progress still complete.
 */
export const oauthVariableSettingsFingerprintOf = (settings: TAgentVaultOauthVariableSettings, disconnects = 0) =>
  crypto
    .createHash("sha256")
    .update(
      JSON.stringify(
        disconnects
          ? { ...oauthVariableSignInSettingsOf(settings), disconnects }
          : oauthVariableSignInSettingsOf(settings)
      )
    )
    .digest("hex");

export const oauthVariableDisconnectsOf = (config: Pick<TAgentVaultOauthVariableConfig, "disconnects">) =>
  config.disconnects ?? 0;

export const isOauthVariableSignInChanged = (
  before: TAgentVaultOauthVariableSettings,
  after: TAgentVaultOauthVariableSettings
) => OAUTH_VARIABLE_SIGN_IN_FIELDS.some((field) => before[field] !== after[field]);

// The settings a stored client secret belongs to. While none of them change, the secret is still the client's.
const OAUTH_VARIABLE_CLIENT_FIELDS = [
  "clientId",
  "tokenEndpoint",
  "tokenEndpointAuthMethod",
  "registration"
] as const satisfies readonly (keyof TAgentVaultOauthVariableSettings)[];

export const isOauthVariableClientChanged = (
  before: TAgentVaultOauthVariableSettings,
  after: TAgentVaultOauthVariableSettings
) => OAUTH_VARIABLE_CLIENT_FIELDS.some((field) => before[field] !== after[field]);

/**
 * The issuer a variable set up by hand records on its sign-in and connection: the one sent, or else the origin of its
 * authorization endpoint, which is where the provider's sign-in lives and so the closest guess (Google issues tokens
 * from oauth2.googleapis.com, but its issuer is https://accounts.google.com). One that was sent is compared exactly with
 * the `iss` a callback carries; for the guess only the origin is, so a path issuer such as a Keycloak realm still passes.
 * Null for a variable that discovers its provider, whose issuer comes from discovery.
 */
export const oauthVariableIssuerOf = (
  settings: Pick<TAgentVaultOauthVariableSettings, "issuer" | "authorizationEndpoint">
): string | null => {
  if (settings.issuer) return settings.issuer;
  if (!settings.authorizationEndpoint) return null;
  return new URL(settings.authorizationEndpoint).origin;
};

// Field and message of the first rule the settings break, worded for the caller, or null.
export const describeOauthVariableSettingsProblem = (
  settings: TAgentVaultOauthVariableSettings
): { field: keyof TAgentVaultOauthVariableSettings; message: string } | null => {
  const manual = isManualOauthVariable(settings);
  if (manual !== Boolean(settings.tokenEndpoint)) {
    return {
      field: manual ? "tokenEndpoint" : "authorizationEndpoint",
      message:
        "Send both 'authorizationEndpoint' and 'tokenEndpoint' to set up the provider by hand, or neither to discover them from 'serverUrl'."
    };
  }
  if (!manual) {
    if (!settings.serverUrl) {
      return {
        field: "serverUrl",
        message:
          "Send 'serverUrl' for Infisical to discover the provider's endpoints, or 'authorizationEndpoint' and 'tokenEndpoint' to set it up by hand."
      };
    }
    // Discovery finds both, and checks them against the server, so a value sent here could only contradict it.
    if (settings.issuer) {
      return {
        field: "issuer",
        message:
          "'issuer' is discovered from 'serverUrl'. Send it only with 'authorizationEndpoint' and 'tokenEndpoint'."
      };
    }
    if (settings.resource) {
      return {
        field: "resource",
        message:
          "'resource' is discovered from 'serverUrl'. Send it only with 'authorizationEndpoint' and 'tokenEndpoint'."
      };
    }
  } else {
    // Registration needs the endpoint discovery finds, so a provider set up by hand always uses the caller's own app.
    if (!settings.clientId) {
      return {
        field: "clientId",
        message:
          "A provider set up by hand needs the client ID of your own OAuth app. Send 'clientId', or send only 'serverUrl' to discover the provider and register a client."
      };
    }
    if (!settings.scopes.length) {
      return {
        field: "scopes",
        message:
          "A provider set up by hand needs at least one scope, since there is no metadata to read them from. Send 'scopes'."
      };
    }
  }
  if (settings.tokenEndpointAuthMethod && !settings.clientId) {
    return {
      field: "tokenEndpointAuthMethod",
      message: "'tokenEndpointAuthMethod' applies only to your own OAuth app. Send 'clientId' with it."
    };
  }
  return null;
};

// What a response shows of an OAuth variable. Tokens and the client secret never leave.
export const toOauthVariableView = ({ settings, connection }: TAgentVaultOauthVariableConfig) => ({
  status: connection?.status ?? AgentVaultOauthStatus.NotConnected,
  ...settings,
  connection: connection
    ? {
        issuer: connection.issuer,
        grantedScopes: connection.grantedScopes ?? [],
        requiredScopes: connection.requiredScopes ?? [],
        expiresAt: connection.expiresAt ?? null,
        authorizedAt: connection.authorizedAt ?? null,
        lastError: connection.lastError ?? null
      }
    : null
});

// The rules for tokens an API caller imports, against the settings they will be stored with. Refresh needs a token
// endpoint, a client and an issuer, which only a variable set up by hand has without a sign-in.
export const describeOauthVariableImportProblem = (
  settings: TAgentVaultOauthVariableSettings,
  tokens: Pick<TAgentVaultOauthVariableTokens, "clientSecret">
): { field: string; message: string } | null => {
  if (!isManualOauthVariable(settings) || !settings.tokenEndpoint || !settings.clientId) {
    return {
      field: "tokens",
      message:
        "Tokens can only be imported into an OAuth variable set up by hand, since refreshing them needs the provider's endpoints and your OAuth app. Send 'authorizationEndpoint', 'tokenEndpoint', 'clientId' and 'scopes' in 'oauth'."
    };
  }
  const method = settings.tokenEndpointAuthMethod;
  if (method && method !== AgentVaultOauthClientAuthMethod.None && !tokens.clientSecret) {
    return {
      field: "tokens.clientSecret",
      message: `The variable's 'tokenEndpointAuthMethod' is '${method}', which needs your OAuth app's client secret. Send 'clientSecret' with the tokens.`
    };
  }
  if (method === AgentVaultOauthClientAuthMethod.None && tokens.clientSecret) {
    return {
      field: "tokens.clientSecret",
      message:
        "The variable's 'tokenEndpointAuthMethod' is 'none', so its OAuth app has no client secret. Leave 'clientSecret' out, or change the method."
    };
  }
  return null;
};

// What an import seals into `encryptedValue`.
export const oauthVariableSecretOf = ({
  accessToken,
  refreshToken,
  clientSecret
}: Pick<TAgentVaultOauthVariableTokens, "accessToken" | "refreshToken" | "clientSecret">): TAgentVaultOauthSecret => ({
  accessToken,
  ...(refreshToken ? { refreshToken } : {}),
  ...(clientSecret ? { clientSecret } : {})
});

/**
 * Imported tokens as they are stored: as sent, with no request to the provider (a refresh would rotate the caller's own
 * copy, and GitHub then revokes both old tokens). The first use is what tells whether the provider accepts them.
 * Check `describeOauthVariableImportProblem` first.
 */
export const toImportedOauthVariableConnection = (
  settings: TAgentVaultOauthVariableSettings,
  { accessToken, refreshToken, expiresAt, clientSecret }: TAgentVaultOauthVariableTokens,
  now: Date
): { connection: TAgentVaultOauthVariableConnection; secret: TAgentVaultOauthSecret } => ({
  connection: {
    type: AgentVaultCredentialType.OAuth,
    grantType: OauthGrantType.AuthorizationCode,
    serverUrl: settings.serverUrl,
    issuer: oauthVariableIssuerOf(settings)!,
    authorizationEndpoint: settings.authorizationEndpoint!,
    tokenEndpoint: settings.tokenEndpoint!,
    resource: settings.resource,
    clientId: settings.clientId!,
    registration: settings.registration,
    tokenEndpointAuthMethod:
      settings.tokenEndpointAuthMethod ??
      (clientSecret ? AgentVaultOauthClientAuthMethod.ClientSecretBasic : AgentVaultOauthClientAuthMethod.None),
    compatibility: [],
    requestedScopes: settings.scopes,
    grantedScopes: settings.scopes,
    requiredScopes: [],
    status: AgentVaultOauthStatus.Connected,
    expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
    accessTokenHash: hashAccessToken(accessToken),
    authorizedAt: now.toISOString(),
    lastRefreshedAt: null,
    lastError: null
  },
  secret: oauthVariableSecretOf({ accessToken, refreshToken, clientSecret })
});
