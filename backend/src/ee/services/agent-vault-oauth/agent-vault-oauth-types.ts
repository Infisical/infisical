import { TGenericPermission } from "@app/lib/types";
import { ActorType } from "@app/services/auth/auth-type";
import { OauthGrantType } from "@app/services/oauth-client/oauth-client-types";

import {
  AgentVaultCredentialType,
  AgentVaultOauthAuthorizationStatus,
  AgentVaultOauthStatus
} from "../agent-vault/agent-vault-enums";
import type { TAgentVaultOwner } from "../agent-vault/agent-vault-owner-fns";

export enum AgentVaultOauthRegistration {
  Dynamic = "dynamic",
  Manual = "manual"
}

export enum AgentVaultOauthClientAuthMethod {
  None = "none",
  ClientSecretBasic = "client_secret_basic",
  ClientSecretPost = "client_secret_post"
}

// Each non-conforming server fallback that was used, recorded on the credential so support can see why a
// server works the way it does.
export enum AgentVaultOauthCompatibility {
  NoProtectedResourceMetadata = "no-protected-resource-metadata",
  ResourceMissing = "resource-missing",
  ResourcePrefix = "resource-prefix",
  NoAuthorizationServerMetadata = "no-authorization-server-metadata",
  IssuerTrailingSlash = "issuer-trailing-slash",
  PkceUnadvertised = "pkce-unadvertised",
  RegistrationMinimal = "registration-minimal",
  ResourceRejected = "resource-rejected",
  ScopeCommaSeparated = "scope-comma-separated"
}

// The MCP authorization spec puts the access token in `Authorization: Bearer`, so it isn't configurable.
export const AGENT_VAULT_OAUTH_HEADER_NAME = "Authorization";
export const AGENT_VAULT_OAUTH_HEADER_PREFIX = "Bearer";

export type TAgentVaultOauthConfig = {
  type: AgentVaultCredentialType.OAuth;
  grantType: OauthGrantType.AuthorizationCode;
  // The server URL the tokens were authorized for.
  serverUrl: string;
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  // Null once the server rejected it (`resource-rejected`), so refresh stops sending it.
  resource: string | null;
  clientId: string;
  registration: AgentVaultOauthRegistration;
  tokenEndpointAuthMethod: AgentVaultOauthClientAuthMethod;
  compatibility: AgentVaultOauthCompatibility[];
  requestedScopes: string[];
  grantedScopes: string[];
  requiredScopes: string[];
  status: AgentVaultOauthStatus;
  expiresAt: string | null;
  accessTokenHash: string;
  authorizedAt: string | null;
  lastRefreshedAt: string | null;
  lastError: string | null;
};

// A service whose OAuth sign-in each member does keeps only what every member's sign-in shares: the server, the issuer
// discovery found there, and the client. Its `encryptedCredential` holds `{ clientSecret }` for an admin-entered client
// with a secret, and is NULL otherwise. Each member's tokens and their TAgentVaultOauthConfig are a personal value.
export type TAgentVaultOauthMemberConfig = {
  type: AgentVaultCredentialType.OAuth;
  serverUrl: string;
  issuer: string;
  registration: AgentVaultOauthRegistration;
  // Set only for an admin-entered client. A dynamic one is registered at each member's sign-in.
  clientId: string | null;
};

// A service whose OAuth credential is an OAuth variable's sign-in. The service row holds no tokens
// (`encryptedCredential` is NULL); they live on the variable, and refresh writes them there.
export type TAgentVaultOauthVariableCredentialConfig = {
  type: AgentVaultCredentialType.OAuth;
  source: "variable";
  variableId: string;
};

// Sealed with the project cipher in `encryptedCredential`.
export type TAgentVaultOauthSecret = {
  accessToken: string;
  refreshToken?: string;
  clientSecret?: string;
};

export type TAgentVaultOauthAuthorization = {
  id: string;
  projectId: string;
  // The service being reauthorized, null for a new service.
  serviceId: string | null;
  // A member's own sign-in for a service that leaves it to members, claimed only by a personal values save.
  personal?: boolean;
  // `memberOauthSetupOf` the service when a personal sign-in started, so a save after an admin changed it is refused.
  memberSetup?: string;
  // A sign-in for this OAuth variable, written into it when the sign-in completes. Never claimed by a service save.
  variableId?: string;
  // `oauthVariableSettingsFingerprintOf` the variable when the sign-in started, so tokens for settings an edit has
  // since changed are never written.
  variableSettingsFingerprint?: string;
  // Who started it. Records written before identities could start one hold only `actorUserId`, and read as that user.
  actor?: TAgentVaultOauthAuthorizationActor;
  actorUserId?: string;
  // The server the sign-in is for. For an OAuth variable set up by hand, its authorization endpoint, which only names
  // the host in messages.
  serverUrl: string;
  state: string;
  redirectUri: string;
  status: AgentVaultOauthAuthorizationStatus;
  error: string | null;
  // What kind of refusal failed a variable sign-in's completion, so completing it again answers with the same status.
  // Records without it read as a bad request.
  errorStatus?: TAgentVaultOauthAuthorizationErrorStatus;
  issuer: string;
  issParameterSupported: boolean;
  // An OAuth variable set up by hand with no issuer of its own, whose `issuer` is only its authorization endpoint's
  // origin. An `iss` on the callback is compared by origin only, since providers such as Keycloak issue from a path
  // under it. Records started before the rename carry `issuerUnchecked` instead, read the same way.
  issuerOriginOnly?: boolean;
  issuerUnchecked?: boolean;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  resource: string | null;
  clientId: string;
  registration: AgentVaultOauthRegistration;
  tokenEndpointAuthMethod: AgentVaultOauthClientAuthMethod;
  compatibility: AgentVaultOauthCompatibility[];
  requestedScopes: string[];
  grantedScopes: string[];
  expiresAt: string | null;
  accessTokenHash: string | null;
  // base64 of the project-cipher blob of `{ codeVerifier, clientSecret? }`.
  sealedPending: string;
  // base64 of the project-cipher blob of a TAgentVaultOauthSecret, set once authorized.
  sealedCredential: string | null;
};

export type TAgentVaultOauthAuthorizationErrorStatus = "bad-request" | "forbidden" | "not-found" | "conflict";

export type TAgentVaultOauthAuthorizationActor = { type: ActorType.USER | ActorType.IDENTITY; id: string };

export type TAgentVaultOauthAuthorizationView = {
  id: string;
  status: AgentVaultOauthAuthorizationStatus;
  error: string | null;
  scopes: string[];
};

export type TCreateAuthorizationDTO = {
  projectId: string;
  ctx: TGenericPermission;
  serverUrl: string;
  serviceId?: string;
  clientId?: string;
  clientSecret?: string;
  registration?: AgentVaultOauthRegistration.Dynamic;
  personal?: boolean;
};

export type TStartVariableAuthorizationDTO = {
  projectId: string;
  ctx: TGenericPermission;
  variableId: string;
  // Your own OAuth app's secret. Without one, a reconnect keeps the secret stored with the variable's tokens.
  clientSecret?: string;
};

export type TCompleteVariableAuthorizationDTO = {
  projectId: string;
  ctx: TGenericPermission;
  variableId: string;
  state: string;
  code?: string;
  iss?: string;
  error?: string;
  errorDescription?: string;
};

export type TCompleteAuthorizationDTO = {
  projectId: string;
  ctx: TGenericPermission;
  authorizationId: string;
  state: string;
  code?: string;
  iss?: string;
  error?: string;
  errorDescription?: string;
};

export type TGetAuthorizationDTO = {
  projectId: string;
  ctx: TGenericPermission;
  authorizationId: string;
};

export type TClaimAuthorizationDTO = {
  authorizationId: string;
  projectId: string;
  // The service the PATCH is for, or undefined on create.
  serviceId?: string;
  ctx: TGenericPermission;
  serverUrl: string;
  personal?: boolean;
};

export type TResolvedOauthCredential = {
  type: AgentVaultCredentialType.Bearer;
  headerName: string;
  headerPrefix: string;
  value: string;
  source: AgentVaultCredentialType.OAuth;
  expiresAt: string | null;
};

// Refreshes an OAuth variable's tokens with no service to pin them to, for a caller that sends them only to a URL an
// admin typed (loading an unsaved service's tools).
export type TRefreshVariableTokenDTO = {
  variableId: string;
  projectId: string;
  rejectedTokenHash?: string;
  expiresWithinSeconds?: number;
};

export type TReportMissingScopesDTO = {
  serviceId: string;
  // Set for a service whose sign-in each member does: the report is about this owner's connection.
  owner?: TAgentVaultOwner;
  // Set for a service whose credential is this OAuth variable: the report is about the variable's sign-in.
  variableId?: string;
  // Set for a session's own service whose tokens were sent with the session.
  inline?: boolean;
  // The sha256 of the token the upstream refused with `insufficient_scope`.
  rejectedTokenHash: string;
  requiredScopes: string[];
  // The host pattern the proxy sent the refused token to. A service that moved since is a 409.
  hostPattern: string;
};

export type TRefreshServiceTokenDTO = {
  serviceId: string;
  projectId: string;
  // Set for a service whose sign-in each member does: the token refreshed is this owner's.
  owner?: TAgentVaultOwner;
  // Set for a service whose credential is this OAuth variable: the token refreshed is the variable's.
  variableId?: string;
  // Set for a session's own service whose tokens were sent with the session: they are refreshed in place on its row.
  inline?: boolean;
  // On demand: the sha256 of the token the upstream rejected.
  rejectedTokenHash?: string;
  // Lazy, from resolve: refresh when the token expires within this many seconds.
  expiresWithinSeconds?: number;
  // Where the caller will send the token. A service that moved since is a 409, never a token for the new server.
  // `serverUrl` undefined skips that half of the check.
  destination: { hostPattern: string | null; serverUrl?: string | null };
};
