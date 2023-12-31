import jwt, { JwtPayload } from "jsonwebtoken";

import { getConfig } from "@app/lib/config/env";
import { UnauthorizedError } from "@app/lib/errors";

import { AuthTokenType } from "../auth/auth-type";
import { TIdentityAccessTokenDalFactory } from "./identity-access-token-dal";
import { TRenewAccessTokenDTO } from "./identity-access-token-types";

type TIdentityAccessTokenServiceFactoryDep = {
  identityAccessTokenDal: TIdentityAccessTokenDalFactory;
};

export type TIdentityAccessTokenServiceFactory = ReturnType<
  typeof identityAccessTokenServiceFactory
>;

export const identityAccessTokenServiceFactory = ({
  identityAccessTokenDal
}: TIdentityAccessTokenServiceFactoryDep) => {
  const renewAccessToken = async ({ accessToken }: TRenewAccessTokenDTO) => {
    const appCfg = getConfig();

    const decodedToken = jwt.verify(accessToken, appCfg.JWT_AUTH_SECRET) as JwtPayload;
    if (decodedToken.authTokenType !== AuthTokenType.IDENTITY_ACCESS_TOKEN)
      throw new UnauthorizedError();

    const identityAccessToken = await identityAccessTokenDal.findOne({
      id: decodedToken.identityAccessTokenId,
      isAccessTokenRevoked: false
    });
    if (!identityAccessToken) throw new UnauthorizedError();

    const {
      accessTokenTTL,
      accessTokenLastRenewedAt,
      accessTokenMaxTTL,
      createdAt: accessTokenCreatedAt
    } = identityAccessToken;
    // ttl check
    if (accessTokenTTL > 0) {
      const currentDate = new Date();
      if (accessTokenLastRenewedAt) {
        // access token has been renewed
        const accessTokenRenewed = new Date(accessTokenLastRenewedAt);
        const ttlInMilliseconds = accessTokenTTL * 1000;
        const expirationDate = new Date(accessTokenRenewed.getTime() + ttlInMilliseconds);

        if (currentDate > expirationDate)
          throw new UnauthorizedError({
            message: "Failed to renew MI access token due to TTL expiration"
          });
      } else {
        // access token has never been renewed
        const accessTokenCreated = new Date(accessTokenCreatedAt);
        const ttlInMilliseconds = accessTokenTTL * 1000;
        const expirationDate = new Date(accessTokenCreated.getTime() + ttlInMilliseconds);

        if (currentDate > expirationDate)
          throw new UnauthorizedError({
            message: "Failed to renew MI access token due to TTL expiration"
          });
      }
    }

    // max ttl checks
    if (accessTokenMaxTTL > 0) {
      const accessTokenCreated = new Date(accessTokenCreatedAt);
      const ttlInMilliseconds = accessTokenMaxTTL * 1000;
      const currentDate = new Date();
      const expirationDate = new Date(accessTokenCreated.getTime() + ttlInMilliseconds);

      if (currentDate > expirationDate)
        throw new UnauthorizedError({
          message: "Failed to renew MI access token due to Max TTL expiration"
        });

      const extendToDate = new Date(currentDate.getTime() + accessTokenTTL);
      if (extendToDate > expirationDate)
        throw new UnauthorizedError({
          message: "Failed to renew MI access token past its Max TTL expiration"
        });
    }

    const updatedIdentityAccessToken = await identityAccessTokenDal.updateById(
      identityAccessToken.id,
      {
        accessTokenLastRenewedAt: new Date()
      }
    );

    return { accessToken, identityAccessToken: updatedIdentityAccessToken };
  };

  return { renewAccessToken };
};
