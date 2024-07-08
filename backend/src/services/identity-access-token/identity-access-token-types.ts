import { TProjectPermission } from "@app/lib/types";

export type TRenewAccessTokenDTO = {
  accessToken: string;
};

export type TIdentityAccessTokenJwtPayload = {
  identityId: string;
  clientSecretId: string;
  identityAccessTokenId: string;
  authTokenType: string;
};

export type TRevokeAccessTokenByIdDTO = {
  tokenId: string;
} & Omit<TProjectPermission, "projectId">;
