import { AuthMethod, AuthTokenType, MfaMethod } from "@app/lib/auth/actor-types";

export enum SsoMfaTrust {
  None = "none",
  Signal = "signal"
}

// Result state from processProviderCallback — determines what the route handler should do
export enum ProviderAuthResult {
  // User is fully authenticated — set refresh cookie and redirect to app
  SESSION = "session",
  // User account is incomplete (new user or unverified alias) — issue signup token
  SIGNUP_REQUIRED = "signup_required"
}

export type TGatewayAccessTokenJwtPayload = {
  authTokenType: AuthTokenType.GATEWAY_ACCESS_TOKEN;
  gatewayId: string;
  orgId: string;
  tokenVersion: number;
};

export type TRelayAccessTokenJwtPayload = {
  authTokenType: AuthTokenType.RELAY_ACCESS_TOKEN;
  relayId: string;
  orgId: string;
  tokenVersion: number;
};

export type TKmipServerAccessTokenJwtPayload = {
  authTokenType: AuthTokenType.KMIP_SERVER_ACCESS_TOKEN;
  kmipServerId: string;
  orgId: string;
  tokenVersion: number;
};

export type TAgentVaultProxyAccessTokenJwtPayload = {
  authTokenType: AuthTokenType.AGENT_VAULT_PROXY_ACCESS_TOKEN;
  agentVaultProxyId: string;
  orgId: string;
  tokenVersion: number;
};

export type AuthModeJwtTokenPayload = {
  authTokenType: AuthTokenType.ACCESS_TOKEN;
  authMethod: AuthMethod;
  userId: string;
  tokenVersionId: string;
  accessVersion: number;
  organizationId?: string;
  subOrganizationId?: string;
  // Root org whose IdP issued this session. Set only by SAML, OIDC and LDAP logins; absent on
  // own-credential sessions and on tokens issued before the claim existed, which are taken at
  // their auth method as before.
  issuingRootOrgId?: string;
  isMfaVerified?: boolean;
  mfaMethod?: MfaMethod;
  idpMfaOrgId?: string;
  // Present only on delegated OAuth 2.0 access tokens. Its presence marks the token as
  // AuthMode.OAUTH so the default JWT middleware will not accept it as a first-party session.
  oauthClientId?: string;
  // Granted OAuth delegation scopes (see OauthScope). The delegated ability is intersected with
  // these in permission-service; an empty/absent list denies all scope-guarded resource access.
  scopes?: string[];
  // Set instead of `scopes` on RFC 8693 token exchange tokens, which carry the user's authorization
  // unnarrowed. Never both. See OauthDelegationMode.
  delegation?: string;
};

export type AuthModeMfaJwtTokenPayload = {
  authTokenType: AuthTokenType.MFA_TOKEN;
  authMethod: AuthMethod;
  userId: string;
  organizationId?: string;
  issuingRootOrgId?: string;
  requiredMfaMethod: MfaMethod;
  idpMfaOrgId?: string;
};

export type AuthModeRefreshJwtTokenPayload = {
  // authMode
  authTokenType: AuthTokenType.REFRESH_TOKEN;
  authMethod: AuthMethod;
  userId: string;
  tokenVersionId: string;
  refreshVersion: number;
  organizationId?: string;
  subOrganizationId?: string;
  issuingRootOrgId?: string;
  isMfaVerified?: boolean;
  mfaMethod?: MfaMethod;
  idpMfaOrgId?: string;
  oauthClientId?: string;
  scopes?: string[];
};

export type AuthModeSignUpTokenPayload = {
  authTokenType: AuthTokenType.SIGNUP_TOKEN;
  userId: string;
  authMethod: AuthMethod;
  isEmailVerified: boolean;
  aliasId?: string;
  organizationId?: string;
  issuingRootOrgId?: string;
  idpMfaOrgId?: string;
  callbackPort?: string;
  // User profile fields for the frontend signup page
  email?: string;
  firstName?: string;
  lastName?: string;
};

export type AuthModeAccountRecoveryTokenPayload = {
  authTokenType: AuthTokenType.ACCOUNT_RECOVERY_TOKEN;
  userId: string;
  jti: string;
  exp: number;
};

export type TProviderAuthCallback =
  | {
      result: ProviderAuthResult.SIGNUP_REQUIRED;
      signupToken: string;
      callbackPort?: number;
    }
  | {
      result: ProviderAuthResult.SESSION;
      tokens: {
        access: string;
        refresh: string;
      };
      callbackPort?: number;
    };
