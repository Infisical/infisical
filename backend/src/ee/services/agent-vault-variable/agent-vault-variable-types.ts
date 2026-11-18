import { TGenericPermission } from "@app/lib/types";

import {
  AgentVaultOauthClientAuthMethod,
  AgentVaultOauthRegistration,
  TAgentVaultOauthConfig,
  TAgentVaultOauthSecret
} from "../agent-vault-oauth/agent-vault-oauth-types";
import {
  AgentVaultOauthVariableConnectMethod,
  AgentVaultServiceType,
  AgentVaultVariableScope,
  AgentVaultVariableType
} from "../agent-vault/agent-vault-enums";
import { TFindAgentVaultVariablesDTO } from "./agent-vault-variable-dal";

export type TAgentVaultVariableScoped = { projectId: string; ctx: TGenericPermission };

export type TListVariablesDTO = TAgentVaultVariableScoped &
  Omit<TFindAgentVaultVariablesDTO, "projectId" | "owners" | "limit" | "accessBundleIds"> & {
    limit?: number;
    // Omitted lists everything the caller can see: their own, and the global ones too for an admin.
    scope?: AgentVaultVariableScope;
  };

/**
 * What an admin sets on an OAuth variable. With `authorizationEndpoint` and `tokenEndpoint` the variable is set up by
 * hand; without them each sign-in runs discovery on `serverUrl`. `registration` follows `clientId`: manual with one,
 * dynamic (a client registered at each sign-in) without.
 */
export type TAgentVaultOauthVariableSettings = {
  serverUrl: string | null;
  issuer: string | null;
  authorizationEndpoint: string | null;
  tokenEndpoint: string | null;
  clientId: string | null;
  registration: AgentVaultOauthRegistration;
  tokenEndpointAuthMethod: AgentVaultOauthClientAuthMethod | null;
  scopes: string[];
  resource: string | null;
  // Sent as client_name when a client is registered. Null sends the project's name.
  clientName: string | null;
  // The caller's own callback for sign-in links made through the API. Null uses Infisical's callback page.
  redirectUri: string | null;
};

// What the last sign-in or import used and got, in the shape a service's OAuth credential keeps, so refresh reads it
// the same way. `serverUrl` is null for a variable set up by hand.
export type TAgentVaultOauthVariableConnection = Omit<TAgentVaultOauthConfig, "serverUrl"> & {
  serverUrl: string | null;
  // The sign-in whose tokens this connection was written from, so a retry of it never writes them again over a
  // refresh. Absent on connections written by an import or before it was kept.
  authorizationId?: string;
  // How that sign-in connected the variable, so a retry of it reports the same outcome.
  authorizationMethod?: AgentVaultOauthVariableConnectMethod;
};

// `oauthConfig` of an OAuth variable. `connection` is null exactly when `encryptedValue` is: not connected yet, or
// disconnected by an edit.
export type TAgentVaultOauthVariableConfig = {
  settings: TAgentVaultOauthVariableSettings;
  connection: TAgentVaultOauthVariableConnection | null;
  // How many times the variable has been disconnected; absent is 0. A sign-in records it when it starts, so one started
  // before a disconnect is refused when it completes, even when the settings it used are back.
  disconnects?: number;
};

// Sealed with the project cipher in `encryptedValue` once connected. A client secret lives only here, so a variable
// that is not connected has none, and the next sign-in has to send it again.
export type TAgentVaultOauthVariableSecret = TAgentVaultOauthSecret;

// Tokens an API caller already holds, imported as sent.
export type TAgentVaultOauthVariableTokens = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  clientSecret?: string;
};

// Settings as an API caller sends them; `registration` is derived, never sent.
export type TAgentVaultOauthVariableSettingsInput = Partial<
  Omit<TAgentVaultOauthVariableSettings, "registration" | "scopes">
> & { scopes?: string[] };

// The same fields as a patch: null clears one, omitted keeps it.
export type TAgentVaultOauthVariableSettingsUpdate = TAgentVaultOauthVariableSettingsInput;

export type TCreateVariableDTO = TAgentVaultVariableScoped & {
  scope: AgentVaultVariableScope;
  key: string;
  type: AgentVaultVariableType;
  value?: string;
  oauth?: TAgentVaultOauthVariableSettingsInput;
  tokens?: TAgentVaultOauthVariableTokens;
  // Starts a sign-in for the new variable, returned with it. Never with `tokens`.
  signIn?: { clientSecret?: string };
};

export type TUpdateVariableDTO = TAgentVaultVariableScoped & {
  variableId: string;
  key?: string;
  // On an OAuth variable only null is taken, which disconnects it.
  value?: string | null;
  oauth?: TAgentVaultOauthVariableSettingsUpdate;
  // Replaces an OAuth variable's tokens with these, after any `oauth` change.
  tokens?: TAgentVaultOauthVariableTokens;
};

export type TVariableByIdDTO = TAgentVaultVariableScoped & { variableId: string };

export type TAgentVaultVariableUsedByService = {
  id: string;
  name: string;
  type: AgentVaultServiceType;
  hostPattern: string | null;
  accessBundles: { id: string; name: string }[];
};
