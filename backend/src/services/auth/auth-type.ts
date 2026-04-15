export enum AuthMethod {
  EMAIL = "email",
  GOOGLE = "google",
  GITHUB = "github",
  GITLAB = "gitlab",
  OKTA_SAML = "okta-saml",
  AZURE_SAML = "azure-saml",
  JUMPCLOUD_SAML = "jumpcloud-saml",
  GOOGLE_SAML = "google-saml",
  KEYCLOAK_SAML = "keycloak-saml",
  LDAP = "ldap",
  OIDC = "oidc"
}

export enum AuthTokenType {
  ACCESS_TOKEN = "accessToken",
  REFRESH_TOKEN = "refreshToken",
  SIGNUP_TOKEN = "signupToken",
  MFA_TOKEN = "mfaToken",
  API_KEY = "apiKey",
  SERVICE_ACCESS_TOKEN = "serviceAccessToken",
  SERVICE_REFRESH_TOKEN = "serviceRefreshToken",
  IDENTITY_ACCESS_TOKEN = "identityAccessToken",
  SCIM_TOKEN = "scimToken"
}

// Result state from processProviderCallback — determines what the route handler should do
export enum ProviderAuthResult {
  // User is fully authenticated — set refresh cookie and redirect to app
  SESSION = "session",
  // User account is incomplete (new user or unverified alias) — issue signup token
  SIGNUP_REQUIRED = "signup_required"
}

export enum AuthMode {
  JWT = "jwt",
  SERVICE_TOKEN = "serviceToken",
  API_KEY = "apiKey",
  IDENTITY_ACCESS_TOKEN = "identityAccessToken",
  SCIM_TOKEN = "scimToken",
  MCP_JWT = "mcpJwt"
}

export enum ActorType { // would extend to AWS, Azure, ...
  PLATFORM = "platform", // Useful for when we want to perform logging on automated actions such as integration syncs.
  KMIP_CLIENT = "kmipClient",
  USER = "user", // userIdentity
  SERVICE = "service",
  IDENTITY = "identity",
  SCIM_CLIENT = "scimClient",
  ACME_PROFILE = "acmeProfile",
  ACME_ACCOUNT = "acmeAccount",
  EST_ACCOUNT = "estAccount",
  SCEP_ACCOUNT = "scepAccount",
  UNKNOWN_USER = "unknownUser"
}

// This will be null unless the token-type is JWT
export type ActorAuthMethod = AuthMethod | null;

export type AuthModeJwtTokenPayload = {
  authTokenType: AuthTokenType.ACCESS_TOKEN;
  authMethod: AuthMethod;
  userId: string;
  tokenVersionId: string;
  accessVersion: number;
  organizationId?: string;
  subOrganizationId?: string;
  isMfaVerified?: boolean;
  mfaMethod?: MfaMethod;
  mcp?: {
    endpointId: string;
  };
};

export type AuthModeMfaJwtTokenPayload = {
  authTokenType: AuthTokenType.MFA_TOKEN;
  authMethod: AuthMethod;
  userId: string;
  organizationId?: string;
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
  isMfaVerified?: boolean;
  mfaMethod?: MfaMethod;
};

export type AuthModeSignUpTokenPayload = {
  authTokenType: AuthTokenType.SIGNUP_TOKEN;
  userId: string;
  authMethod: AuthMethod;
  isEmailVerified: boolean;
  aliasId?: string;
  organizationId?: string;
  callbackPort?: string;
  // User profile fields for the frontend signup page
  email?: string;
  firstName?: string;
  lastName?: string;
};

export enum MfaMethod {
  EMAIL = "email",
  TOTP = "totp",
  WEBAUTHN = "webauthn"
}

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
