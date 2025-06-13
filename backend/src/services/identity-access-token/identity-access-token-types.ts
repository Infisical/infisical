export type TRenewAccessTokenDTO = {
  accessToken: string;
};

export type TIdentityAccessTokenJwtPayload = {
  identityId: string;
  clientSecretId: string;
  identityAccessTokenId: string;
  authTokenType: string;
  identityAuth: {
    oidc?: {
      claims: Record<string, string>;
    };
    kubernetes?: {
      namespace: string;
      name: string;
    };
  };
};
