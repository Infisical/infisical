export type TOauthClient = {
  id: string;
  orgId: string;
  name: string;
  description?: string | null;
  clientId: string;
  clientSecretPrefix: string;
  redirectUris: string[];
  requirePkce: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TCreateOauthClientDTO = {
  name: string;
  description?: string;
  redirectUris: string[];
  requirePkce?: boolean;
};

export type TUpdateOauthClientDTO = {
  clientDbId: string;
  name?: string;
  description?: string | null;
  redirectUris?: string[];
  requirePkce?: boolean;
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
