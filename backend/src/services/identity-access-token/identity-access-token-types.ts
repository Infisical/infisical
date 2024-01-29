export type TRenewAccessTokenDTO = {
  accessToken: string;
};

export type TIdentityAccessTokenJwtPayload = {
  identityId: string;
  clientSecretId: string;
  identityAccessTokenId: string;
  authTokenType: string;
};
