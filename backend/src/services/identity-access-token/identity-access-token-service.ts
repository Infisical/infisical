import jwt, { JwtPayload } from "jsonwebtoken";

import { TableName, TIdentityAccessTokens } from "@app/db/schemas";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, UnauthorizedError } from "@app/lib/errors";
import { checkIPAgainstBlocklist, TIp } from "@app/lib/ip";

import { TAccessTokenQueueServiceFactory } from "../access-token-queue/access-token-queue";
import { AuthTokenType } from "../auth/auth-type";
import { TIdentityOrgDALFactory } from "../identity/identity-org-dal";
import { TIdentityAccessTokenDALFactory } from "./identity-access-token-dal";
import { TIdentityAccessTokenJwtPayload, TRenewAccessTokenDTO } from "./identity-access-token-types";

type TIdentityAccessTokenServiceFactoryDep = {
  identityAccessTokenDAL: TIdentityAccessTokenDALFactory;
  identityOrgMembershipDAL: TIdentityOrgDALFactory;
  accessTokenQueue: Pick<
    TAccessTokenQueueServiceFactory,
    "updateIdentityAccessTokenStatus" | "getIdentityTokenDetailsInCache"
  >;
};

export type TIdentityAccessTokenServiceFactory = ReturnType<typeof identityAccessTokenServiceFactory>;

export const identityAccessTokenServiceFactory = ({
  identityAccessTokenDAL,
  identityOrgMembershipDAL,
  accessTokenQueue
}: TIdentityAccessTokenServiceFactoryDep) => {
  const validateAccessTokenExp = async (identityAccessToken: TIdentityAccessTokens) => {
    const {
      id: tokenId,
      accessTokenNumUses,
      accessTokenTTL,
      accessTokenNumUsesLimit,
      accessTokenLastRenewedAt,
      createdAt: accessTokenCreatedAt
    } = identityAccessToken;

    if (accessTokenNumUsesLimit > 0 && accessTokenNumUses > 0 && accessTokenNumUses >= accessTokenNumUsesLimit) {
      await identityAccessTokenDAL.deleteById(tokenId);
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

        if (currentDate > expirationDate) {
          await identityAccessTokenDAL.deleteById(tokenId);
          throw new UnauthorizedError({
            message: "Failed to renew MI access token due to TTL expiration"
          });
        }
      } else {
        // access token has never been renewed
        const accessTokenCreated = new Date(accessTokenCreatedAt);
        const ttlInMilliseconds = Number(accessTokenTTL) * 1000;
        const expirationDate = new Date(accessTokenCreated.getTime() + ttlInMilliseconds);

        if (currentDate > expirationDate) {
          await identityAccessTokenDAL.deleteById(tokenId);
          throw new UnauthorizedError({
            message: "Failed to renew MI access token due to TTL expiration"
          });
        }
      }
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

    let { accessTokenNumUses } = identityAccessToken;
    const tokenStatusInCache = await accessTokenQueue.getIdentityTokenDetailsInCache(identityAccessToken.id);
    if (tokenStatusInCache) {
      accessTokenNumUses = tokenStatusInCache.numberOfUses;
    }
    await validateAccessTokenExp({ ...identityAccessToken, accessTokenNumUses });

    const { accessTokenMaxTTL, createdAt: accessTokenCreatedAt, accessTokenTTL } = identityAccessToken;

    // max ttl checks - will it go above max ttl
    if (Number(accessTokenMaxTTL) > 0) {
      const accessTokenCreated = new Date(accessTokenCreatedAt);
      const ttlInMilliseconds = Number(accessTokenMaxTTL) * 1000;
      const currentDate = new Date();
      const expirationDate = new Date(accessTokenCreated.getTime() + ttlInMilliseconds);

      if (currentDate > expirationDate) {
        await identityAccessTokenDAL.deleteById(identityAccessToken.id);
        throw new UnauthorizedError({
          message: "Failed to renew MI access token due to Max TTL expiration"
        });
      }

      const extendToDate = new Date(currentDate.getTime() + Number(accessTokenTTL * 1000));
      if (extendToDate > expirationDate) {
        await identityAccessTokenDAL.deleteById(identityAccessToken.id);
        throw new UnauthorizedError({
          message: "Failed to renew MI access token past its Max TTL expiration"
        });
      }
    }

    const updatedIdentityAccessToken = await identityAccessTokenDAL.updateById(identityAccessToken.id, {
      accessTokenLastRenewedAt: new Date()
    });

    return { accessToken, identityAccessToken: updatedIdentityAccessToken };
  };

  const revokeAccessToken = async (accessToken: string) => {
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

    const revokedToken = await identityAccessTokenDAL.updateById(identityAccessToken.id, {
      isAccessTokenRevoked: true
    });

    return { revokedToken };
  };

  const fnValidateIdentityAccessToken = async (token: TIdentityAccessTokenJwtPayload, ipAddress?: string) => {
    const identityAccessToken = await identityAccessTokenDAL.findOne({
      [`${TableName.IdentityAccessToken}.id` as "id"]: token.identityAccessTokenId,
      isAccessTokenRevoked: false
    });
    if (!identityAccessToken) throw new UnauthorizedError();
    if (identityAccessToken.isAccessTokenRevoked)
      throw new UnauthorizedError({
        message: "Failed to authorize revoked access token"
      });

    if (ipAddress && identityAccessToken) {
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

    let { accessTokenNumUses } = identityAccessToken;
    const tokenStatusInCache = await accessTokenQueue.getIdentityTokenDetailsInCache(identityAccessToken.id);
    if (tokenStatusInCache) {
      accessTokenNumUses = tokenStatusInCache.numberOfUses;
    }
    await validateAccessTokenExp({ ...identityAccessToken, accessTokenNumUses });

    await accessTokenQueue.updateIdentityAccessTokenStatus(identityAccessToken.id, Number(accessTokenNumUses) + 1);
    return { ...identityAccessToken, orgId: identityOrgMembership.orgId };
  };

  return { renewAccessToken, revokeAccessToken, fnValidateIdentityAccessToken };
};
