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
  SIGNUP_TOKEN = "signupToken", // TODO: remove in favor of claim
  MFA_TOKEN = "mfaToken", // TODO: remove in favor of claim
  PROVIDER_TOKEN = "providerToken", // TODO: remove in favor of claim
  API_KEY = "apiKey",
  SERVICE_ACCESS_TOKEN = "serviceAccessToken",
  SERVICE_REFRESH_TOKEN = "serviceRefreshToken",
  IDENTITY_ACCESS_TOKEN = "identityAccessToken",
  SCIM_TOKEN = "scimToken"
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
  Machine = "machine",
  SCIM_CLIENT = "scimClient",
  ACME_PROFILE = "acmeProfile",
  ACME_ACCOUNT = "acmeAccount",
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

export type AuthModeProviderJwtTokenPayload = {
  authTokenType: AuthTokenType.PROVIDER_TOKEN;
  username: string;
  authMethod: AuthMethod;
  email: string;
  organizationId?: string;
};

export type AuthModeProviderSignUpTokenPayload = {
  authTokenType: AuthTokenType.SIGNUP_TOKEN;
  userId: string;
};

export enum MfaMethod {
  EMAIL = "email",
  TOTP = "totp",
  WEBAUTHN = "webauthn"
}
