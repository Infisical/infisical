import { TGenericPermission } from "@app/lib/types";
import { OauthGrantType } from "@app/services/oauth-client/oauth-client-types";

import {
  AgentVaultCredentialType,
  AgentVaultOauthAuthorizationStatus,
  AgentVaultOauthStatus
} from "../agent-vault/agent-vault-enums";

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

// Sealed with the project cipher in `encryptedCredential`.
export type TAgentVaultOauthSecret = {
  accessToken: string;
  refreshToken?: string;
  clientSecret?: string;
};

export type TAgentVaultOauthAuthorization = {
  id: string;
  projectId: string;
  accessBundleId: string;
  // The service being reauthorized, null for a new service.
  serviceId: string | null;
  actorUserId: string;
  serverUrl: string;
  state: string;
  redirectUri: string;
  status: AgentVaultOauthAuthorizationStatus;
  error: string | null;
  issuer: string;
  issParameterSupported: boolean;
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

export type TAgentVaultOauthAuthorizationView = {
  id: string;
  status: AgentVaultOauthAuthorizationStatus;
  error: string | null;
  scopes: string[];
};

export type TCreateAuthorizationDTO = {
  projectId: string;
  ctx: TGenericPermission;
  accessBundleId: string;
  serverUrl: string;
  serviceId?: string;
  clientId?: string;
  clientSecret?: string;
  registration?: AgentVaultOauthRegistration.Dynamic;
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
  accessBundleId: string;
  // The service the PATCH is for, or undefined on create.
  serviceId?: string;
  ctx: TGenericPermission;
  serverUrl: string;
};

export type TResolvedOauthCredential = {
  type: AgentVaultCredentialType.Bearer;
  headerName: string;
  headerPrefix: string;
  value: string;
  source: AgentVaultCredentialType.OAuth;
  expiresAt: string | null;
};

export type TReportMissingScopesDTO = {
  serviceId: string;
  // The sha256 of the token the upstream refused with `insufficient_scope`.
  rejectedTokenHash: string;
  requiredScopes: string[];
  // The host pattern the proxy sent the refused token to. A service that moved since is a 409.
  hostPattern: string;
};

export type TRefreshServiceTokenDTO = {
  serviceId: string;
  projectId: string;
  // On demand: the sha256 of the token the upstream rejected.
  rejectedTokenHash?: string;
  // Lazy, from resolve: refresh when the token expires within this many seconds.
  expiresWithinSeconds?: number;
  // Where the caller will send the token. A service that moved since is a 409, never a token for the new server.
  // `serverUrl` undefined skips that half of the check.
  destination: { hostPattern: string; serverUrl?: string | null };
};
