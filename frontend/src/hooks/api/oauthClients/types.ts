// Redirect URIs and PKCE apply only to AuthorizationCode, the audience only to TokenExchange.
export enum OauthGrantType {
  AuthorizationCode = "authorization_code",
  RefreshToken = "refresh_token",
  TokenExchange = "urn:ietf:params:oauth:grant-type:token-exchange"
}

export type TOauthClient = {
  id: string;
  orgId: string;
  name: string;
  description?: string | null;
  clientId: string;
  clientSecretPrefix: string;
  grantTypes: OauthGrantType[];
  redirectUris: string[];
  requirePkce: boolean;
  tokenExchangeAudience?: string | null;
  tokenExchangeIdpSatisfiesMfa: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TCreateOauthClientDTO = {
  name: string;
  description?: string;
  grantTypes: OauthGrantType[];
  redirectUris: string[];
  requirePkce?: boolean;
  tokenExchangeAudience?: string;
  tokenExchangeIdpSatisfiesMfa?: boolean;
};

export type TUpdateOauthClientDTO = {
  clientDbId: string;
  name?: string;
  description?: string | null;
  grantTypes?: OauthGrantType[];
  redirectUris?: string[];
  requirePkce?: boolean;
  tokenExchangeAudience?: string | null;
  tokenExchangeIdpSatisfiesMfa?: boolean;
};

export type TDeleteOauthClientDTO = {
  clientDbId: string;
};

export type TRotateOauthClientSecretDTO = {
  clientDbId: string;
};

export type TOauthRequestedScope = {
  scope: string;
  description: string;
};

export type TOauthAuthorizeInfo = {
  clientName: string;
  clientDescription?: string | null;
  requirePkce: boolean;
  requestedScopes: TOauthRequestedScope[];
};

export type TOauthConsentDTO = {
  clientId: string;
  redirectUri: string;
  state?: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
  scope?: string;
};
