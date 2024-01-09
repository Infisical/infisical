export enum AuthMethod {
  EMAIL = "email",
  GOOGLE = "google",
  GITHUB = "github",
  GITLAB = "gitlab",
  OKTA_SAML = "okta-saml",
  AZURE_SAML = "azure-saml",
  JUMPCLOUD_SAML = "jumpcloud-saml"
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
  IDENTITY_ACCESS_TOKEN = "identityAccessToken"
}

export enum AuthMode {
  JWT = "jwt",
  SERVICE_TOKEN = "serviceToken",
  SERVICE_ACCESS_TOKEN = "serviceAccessToken",
  API_KEY = "apiKey",
  API_KEY_V2 = "apiKeyV2",
  IDENTITY_ACCESS_TOKEN = "identityAccessToken"
}

export enum ActorType { // would extend to AWS, Azure, ...
  USER = "user", // userIdentity
  SERVICE = "service",
  IDENTITY = "identity",
  Machine = "machine"
}

export type AuthModeJwtTokenPayload = {
  authTokenType: AuthTokenType.ACCESS_TOKEN;
  userId: string;
  tokenVersionId: string;
  accessVersion: number;
};

export type AuthModeRefreshJwtTokenPayload = {
  authTokenType: AuthTokenType.REFRESH_TOKEN;
  userId: string;
  tokenVersionId: string;
  refreshVersion: number;
};
