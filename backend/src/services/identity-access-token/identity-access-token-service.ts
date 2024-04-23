import jwt, { JwtPayload } from "jsonwebtoken";

import { TableName, TIdentityAccessTokens } from "@app/db/schemas";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, UnauthorizedError } from "@app/lib/errors";
import { checkIPAgainstBlocklist, TIp } from "@app/lib/ip";

import { AuthTokenType } from "../auth/auth-type";
import { TIdentityOrgDALFactory } from "../identity/identity-org-dal";
import { TIdentityAccessTokenDALFactory } from "./identity-access-token-dal";
import { TIdentityAccessTokenJwtPayload, TRenewAccessTokenDTO } from "./identity-access-token-types";

type TIdentityAccessTokenServiceFactoryDep = {
  identityAccessTokenDAL: TIdentityAccessTokenDALFactory;
  identityOrgMembershipDAL: TIdentityOrgDALFactory;
};

export type TIdentityAccessTokenServiceFactory = ReturnType<typeof identityAccessTokenServiceFactory>;

export const identityAccessTokenServiceFactory = ({
  identityAccessTokenDAL,
  identityOrgMembershipDAL
}: TIdentityAccessTokenServiceFactoryDep) => {
  const validateAccessTokenExp = (identityAccessToken: TIdentityAccessTokens) => {
    const {
      accessTokenTTL,
      accessTokenNumUses,
      accessTokenNumUsesLimit,
      accessTokenLastRenewedAt,
      accessTokenMaxTTL,
      createdAt: accessTokenCreatedAt
    } = identityAccessToken;

    if (accessTokenNumUsesLimit > 0 && accessTokenNumUses > 0 && accessTokenNumUses >= accessTokenNumUsesLimit) {
      throw new BadRequestError({
        message: "Unable to renew because access token number of uses limit reached"
      });
    }

    // ttl check
    if (Number(accessTokenTTL) > 0) {
      const currentDate = new Date();
      if (accessTokenLastRenewedAt) {
        // access token has been renewed
        const accessTokenRenewed = new Date(accessTokenLastRenewedAt);
        const ttlInMilliseconds = Number(accessTokenTTL) * 1000;
        const expirationDate = new Date(accessTokenRenewed.getTime() + ttlInMilliseconds);

        if (currentDate > expirationDate)
          throw new UnauthorizedError({
            message: "Failed to renew MI access token due to TTL expiration"
          });
      } else {
        // access token has never been renewed
        const accessTokenCreated = new Date(accessTokenCreatedAt);
        const ttlInMilliseconds = Number(accessTokenTTL) * 1000;
        const expirationDate = new Date(accessTokenCreated.getTime() + ttlInMilliseconds);

        if (currentDate > expirationDate)
          throw new UnauthorizedError({
            message: "Failed to renew MI access token due to TTL expiration"
          });
      }
    }

    // max ttl checks
    if (Number(accessTokenMaxTTL) > 0) {
      const accessTokenCreated = new Date(accessTokenCreatedAt);
      const ttlInMilliseconds = Number(accessTokenMaxTTL) * 1000;
      const currentDate = new Date();
      const expirationDate = new Date(accessTokenCreated.getTime() + ttlInMilliseconds);

      if (currentDate > expirationDate)
        throw new UnauthorizedError({
          message: "Failed to renew MI access token due to Max TTL expiration"
        });

      const extendToDate = new Date(currentDate.getTime() + Number(accessTokenTTL));
      if (extendToDate > expirationDate)
        throw new UnauthorizedError({
          message: "Failed to renew MI access token past its Max TTL expiration"
        });
    }
  };

  const renewAccessToken = async ({ accessToken }: TRenewAccessTokenDTO) => {
    const appCfg = getConfig();

    const decodedToken = jwt.verify(accessToken, appCfg.AUTH_SECRET) as JwtPayload & {
      identityAccessTokenId: string;
    };
    if (decodedToken.authTokenType !== AuthTokenType.IDENTITY_ACCESS_TOKEN) throw new UnauthorizedError();

    const identityAccessToken = await identityAccessTokenDAL.findOne({
      [`${TableName.IdentityAccessToken}.id` as "id"]: decodedToken.identityAccessTokenId,
      isAccessTokenRevoked: false
    });
    if (!identityAccessToken) throw new UnauthorizedError();

    validateAccessTokenExp(identityAccessToken);

    const updatedIdentityAccessToken = await identityAccessTokenDAL.updateById(identityAccessToken.id, {
      accessTokenLastRenewedAt: new Date()
    });

    return { accessToken, identityAccessToken: updatedIdentityAccessToken };
  };

  const fnValidateIdentityAccessToken = async (token: TIdentityAccessTokenJwtPayload, ipAddress?: string) => {
    const identityAccessToken = await identityAccessTokenDAL.findOne({
      [`${TableName.IdentityAccessToken}.id` as "id"]: token.identityAccessTokenId,
      isAccessTokenRevoked: false
    });
    if (!identityAccessToken) throw new UnauthorizedError();

    if (ipAddress) {
      checkIPAgainstBlocklist({
        ipAddress,
        trustedIps: identityAccessToken?.accessTokenTrustedIps as TIp[]
      });
    }

    const identityOrgMembership = await identityOrgMembershipDAL.findOne({
      identityId: identityAccessToken.identityId
    });

    if (!identityOrgMembership) {
      throw new UnauthorizedError({ message: "Identity does not belong to any organization" });
    }

    validateAccessTokenExp(identityAccessToken);
    return { ...identityAccessToken, orgId: identityOrgMembership.orgId };
  };

  return { renewAccessToken, fnValidateIdentityAccessToken };
};
