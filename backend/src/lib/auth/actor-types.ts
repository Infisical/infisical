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
  AUTH0_SAML = "auth0-saml",
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
  SCIM_TOKEN = "scimToken",
  GATEWAY_ACCESS_TOKEN = "gatewayAccessToken",
  RELAY_ACCESS_TOKEN = "relayAccessToken",
  KMIP_SERVER_ACCESS_TOKEN = "kmipServerAccessToken",
  AGENT_VAULT_PROXY_ACCESS_TOKEN = "agentVaultProxyAccessToken",
  ACCOUNT_RECOVERY_TOKEN = "accountRecoveryToken"
}

export enum AuthMode {
  JWT = "jwt",
  SERVICE_TOKEN = "serviceToken",
  API_KEY = "apiKey",
  IDENTITY_ACCESS_TOKEN = "identityAccessToken",
  SCIM_TOKEN = "scimToken",
  // Delegated OAuth 2.0 access tokens issued via the authorization code flow. These are NOT
  // first-party dashboard sessions: a route must explicitly opt into AuthMode.OAUTH to accept them.
  OAUTH = "oauth",
  GATEWAY_ACCESS_TOKEN = "gatewayAccessToken",
  RELAY_ACCESS_TOKEN = "relayAccessToken",
  KMIP_SERVER_ACCESS_TOKEN = "kmipServerAccessToken",
  AGENT_VAULT_PROXY_ACCESS_TOKEN = "agentVaultProxyAccessToken"
}

export enum ActorType {
  // would extend to AWS, Azure, ...
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
  UNKNOWN_USER = "unknownUser",
  GATEWAY = "gateway",
  RELAY = "relay",
  KMIP_SERVER = "kmipServer",
  AGENT_VAULT_PROXY = "agentVaultProxy"
}

export enum MfaMethod {
  EMAIL = "email",
  TOTP = "totp",
  WEBAUTHN = "webauthn"
}

// This will be null unless the token-type is JWT
export type ActorAuthMethod = AuthMethod | null;
