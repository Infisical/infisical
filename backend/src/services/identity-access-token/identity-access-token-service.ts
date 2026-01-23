import { TIdentityAccessTokens } from "@app/db/schemas/identity-access-tokens";
import { AccessScope, IdentityAuthMethod, TableName } from "@app/db/schemas/models";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto";
import { BadRequestError, UnauthorizedError } from "@app/lib/errors";
import { checkIPAgainstBlocklist, TIp } from "@app/lib/ip";

import { TAccessTokenQueueServiceFactory } from "../access-token-queue/access-token-queue";
import { AuthTokenType } from "../auth/auth-type";
import { TIdentityDALFactory } from "../identity/identity-dal";
import { TMembershipIdentityDALFactory } from "../membership-identity/membership-identity-dal";
import { TOrgDALFactory } from "../org/org-dal";
import { TIdentityAccessTokenDALFactory } from "./identity-access-token-dal";
import { TIdentityAccessTokenJwtPayload, TRenewAccessTokenDTO } from "./identity-access-token-types";

type TIdentityAccessTokenServiceFactoryDep = {
  identityAccessTokenDAL: TIdentityAccessTokenDALFactory;
  identityDAL: Pick<TIdentityDALFactory, "getTrustedIpsByAuthMethod">;
  accessTokenQueue: Pick<
    TAccessTokenQueueServiceFactory,
    "updateIdentityAccessTokenStatus" | "getIdentityTokenDetailsInCache"
  >;
  membershipIdentityDAL: Pick<TMembershipIdentityDALFactory, "findOne">;
  orgDAL: Pick<TOrgDALFactory, "findOne">;
};

export type TIdentityAccessTokenServiceFactory = ReturnType<typeof identityAccessTokenServiceFactory>;

export const identityAccessTokenServiceFactory = ({
  identityAccessTokenDAL,
  accessTokenQueue,
  identityDAL,
  membershipIdentityDAL,
  orgDAL
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
      throw new UnauthorizedError({
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

    const decodedToken = crypto.jwt().verify(accessToken, appCfg.AUTH_SECRET) as TIdentityAccessTokenJwtPayload;
    if (decodedToken.authTokenType !== AuthTokenType.IDENTITY_ACCESS_TOKEN) {
      throw new BadRequestError({ message: "Only identity access tokens can be renewed" });
    }

    const identityAccessToken = await identityAccessTokenDAL.findOne({
      [`${TableName.IdentityAccessToken}.id` as "id"]: decodedToken.identityAccessTokenId,
      isAccessTokenRevoked: false
    });
    if (!identityAccessToken) throw new UnauthorizedError({ message: "No identity access token found" });

    let { accessTokenNumUses } = identityAccessToken;
    const tokenStatusInCache = await accessTokenQueue.getIdentityTokenDetailsInCache(identityAccessToken.id);
    if (tokenStatusInCache) {
      accessTokenNumUses = tokenStatusInCache.numberOfUses;
    }
    await validateAccessTokenExp({ ...identityAccessToken, accessTokenNumUses });

    const {
      accessTokenMaxTTL,
      createdAt: accessTokenCreatedAt,
      accessTokenTTL,
      accessTokenPeriod
    } = identityAccessToken;

    // Only enforce Max TTL for non-periodic tokens
    if (Number(accessTokenMaxTTL) > 0 && Number(accessTokenPeriod) === 0) {
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

    const ttl = Number(accessTokenTTL);
    const period = Number(accessTokenPeriod);

    let expiresIn: number | undefined;
    if (period > 0) {
      expiresIn = period;
    } else if (ttl > 0) {
      expiresIn = ttl;
    } else {
      expiresIn = undefined;
    }

    const renewedToken = crypto.jwt().sign(
      {
        identityId: decodedToken.identityId,
        clientSecretId: decodedToken.clientSecretId,
        identityAccessTokenId: decodedToken.identityAccessTokenId,
        authTokenType: AuthTokenType.IDENTITY_ACCESS_TOKEN
      } as TIdentityAccessTokenJwtPayload,
      appCfg.AUTH_SECRET,
      expiresIn !== undefined ? { expiresIn } : undefined
    );

    return { accessToken: renewedToken, identityAccessToken: updatedIdentityAccessToken };
  };

  const revokeAccessToken = async (accessToken: string) => {
    const appCfg = getConfig();

    const decodedToken = crypto.jwt().verify(accessToken, appCfg.AUTH_SECRET) as TIdentityAccessTokenJwtPayload & {
      identityAccessTokenId: string;
    };
    if (decodedToken.authTokenType !== AuthTokenType.IDENTITY_ACCESS_TOKEN) {
      throw new UnauthorizedError({ message: "Only identity access tokens can be revoked" });
    }

    const identityAccessToken = await identityAccessTokenDAL.findOne({
      [`${TableName.IdentityAccessToken}.id` as "id"]: decodedToken.identityAccessTokenId,
      isAccessTokenRevoked: false
    });
    if (!identityAccessToken) throw new UnauthorizedError({ message: "No identity access token found" });

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
    if (!identityAccessToken) throw new UnauthorizedError({ message: "No identity access token found" });
    if (identityAccessToken.isAccessTokenRevoked)
      throw new UnauthorizedError({
        message: "Failed to authorize revoked access token, access token is revoked"
      });

    const trustedIps = await identityDAL.getTrustedIpsByAuthMethod(
      identityAccessToken.identityId,
      identityAccessToken.authMethod as IdentityAuthMethod
    );
    if (ipAddress && trustedIps) {
      checkIPAgainstBlocklist({
        ipAddress,
        trustedIps: trustedIps as TIp[]
      });
    }

    const scopeOrgId = identityAccessToken.subOrganizationId || identityAccessToken.identityOrgId;

    const identityOrgDetails = await orgDAL.findOne({ id: scopeOrgId });

    const isSubOrg = Boolean(identityOrgDetails.rootOrgId);

    const rootOrgId = isSubOrg ? identityOrgDetails.rootOrgId || identityOrgDetails.id : identityOrgDetails.id;

    // Verify identity membership in the organization
    const identityOrgMembership = await membershipIdentityDAL.findOne({
      scope: AccessScope.Organization,
      actorIdentityId: identityAccessToken.identityId,
      scopeOrgId: identityOrgDetails.id
    });

    if (!identityOrgMembership) {
      throw new BadRequestError({ message: "Identity does not belong to this organization" });
    }

    const orgId = identityOrgDetails.id;
    const orgName = identityOrgDetails.name;
    const parentOrgId = identityOrgDetails.parentOrgId || rootOrgId;

    let { accessTokenNumUses } = identityAccessToken;
    const tokenStatusInCache = await accessTokenQueue.getIdentityTokenDetailsInCache(identityAccessToken.id);
    if (tokenStatusInCache) {
      accessTokenNumUses = tokenStatusInCache.numberOfUses;
    }
    await validateAccessTokenExp({ ...identityAccessToken, accessTokenNumUses });

    await accessTokenQueue.updateIdentityAccessTokenStatus(identityAccessToken.id, Number(accessTokenNumUses) + 1);
    return { ...identityAccessToken, orgId, rootOrgId, parentOrgId, orgName };
  };

  return { renewAccessToken, revokeAccessToken, fnValidateIdentityAccessToken };
};
