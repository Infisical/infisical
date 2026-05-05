import { Knex } from "knex";

import { IdentityAuthMethod, OrgMembershipStatus, TableName, TIdentityAccessTokens } from "@app/db/schemas";
import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto";
import { UnauthorizedError } from "@app/lib/errors";
import { checkIPAgainstBlocklist, TIp } from "@app/lib/ip";

import { ActorType } from "../auth/auth-type";
import { TIdentityDALFactory } from "../identity/identity-dal";
import { TOrgDALFactory } from "../org/org-dal";
import { TIdentityAccessTokenDALFactory } from "./identity-access-token-dal";
import {
  assertMinimalRenewClaims,
  assertRevocableClaims,
  computeIssuedTtl,
  hasFullRenewClaims,
  hasLegacyTokenWithoutExpExceededMaxAge,
  hasNonWildcardTrustedIps,
  parseUsesRemaining,
  resolveTtlInputs,
  signIdentityAccessToken,
  verifyAccessTokenJwt
} from "./identity-access-token-fns";
import { TIdentityAccessTokenRevocationDALFactory } from "./identity-access-token-revocation-dal";
import {
  TAWSAuthDetails,
  TIdentityAccessTokenJwtPayload,
  TKubernetesAuthDetails,
  TMinimalRenewClaims,
  TOidcAuthDetails,
  TRenewAccessTokenDTO,
  TRenewSource
} from "./identity-access-token-types";

export type TIssueIdentityAccessTokenInput = {
  identityId: string;
  identityName: string;
  authMethod: IdentityAuthMethod;
  orgId: string;
  rootOrgId: string;
  parentOrgId: string;
  subOrganizationId: string | null;
  accessTokenTTL: number;
  accessTokenMaxTTL: number;
  accessTokenNumUsesLimit: number;
  // 0 = standard TTL/MaxTTL. > 0 = periodic mode (TTL is the period).
  accessTokenPeriod: number;
  accessTokenTrustedIps: TIp[];
  clientSecretId?: string;
  identityAuth?: {
    oidc?: TOidcAuthDetails;
    kubernetes?: TKubernetesAuthDetails;
    aws?: TAWSAuthDetails;
  };
  // Set by Token Auth to insert a real PG row in its transaction; every other
  // auth method omits this and gets a fresh in-memory UUID.
  persistToPg?: { tx: Knex; name?: string | null };
};

export type TIssueIdentityAccessTokenOutput = {
  accessToken: string;
  identityAccessToken: TIdentityAccessTokens;
};

type TIdentityAccessTokenServiceFactoryDep = {
  identityAccessTokenDAL: TIdentityAccessTokenDALFactory;
  identityAccessTokenRevocationDAL: TIdentityAccessTokenRevocationDALFactory;
  identityDAL: Pick<TIdentityDALFactory, "getTrustedIpsByAuthMethod" | "findById">;
  orgDAL: Pick<TOrgDALFactory, "findEffectiveOrgMembership">;
  keyStore: Pick<TKeyStoreFactory, "getItem" | "incrementBy" | "setItemWithExpiry">;
};

export type TIdentityAccessTokenServiceFactory = ReturnType<typeof identityAccessTokenServiceFactory>;

export const identityAccessTokenServiceFactory = ({
  identityAccessTokenDAL,
  identityAccessTokenRevocationDAL,
  identityDAL,
  orgDAL,
  keyStore
}: TIdentityAccessTokenServiceFactoryDep) => {
  const setUsesRemaining = async (identityId: string, tokenId: string, usesRemaining: number, ttlSeconds: number) => {
    await keyStore.setItemWithExpiry(
      KeyStorePrefixes.IdentityTokenUsesRemaining(identityId, tokenId),
      ttlSeconds,
      usesRemaining
    );
  };

  const assertTokenIsNotRevoked = async ({
    tokenId,
    identityId,
    issuedAtMs,
    messagePrefix = "Failed to authorize"
  }: {
    tokenId: string;
    identityId: string;
    issuedAtMs: number;
    messagePrefix?: "Failed to authorize" | "Cannot renew";
  }) => {
    const activeRevocations = await identityAccessTokenRevocationDAL.findActiveRevocationsForToken({
      tokenId,
      identityId
    });

    for (const revocation of activeRevocations) {
      if (revocation.id === tokenId) {
        throw new UnauthorizedError({ message: `${messagePrefix}: token has been revoked` });
      }

      if (revocation.id === identityId) {
        const revokedAtMs = (revocation.revokedAt ?? revocation.createdAt).getTime();
        if (issuedAtMs < revokedAtMs) {
          throw new UnauthorizedError({ message: `${messagePrefix}: identity tokens have been revoked` });
        }
      }
    }
  };

  // Token Auth materializes a PG row at issuance (admin-managed UI list);
  // every other method lazily inserts a row only on revoke.
  const issueIdentityAccessToken = async (
    input: TIssueIdentityAccessTokenInput
  ): Promise<TIssueIdentityAccessTokenOutput> => {
    const appCfg = getConfig();
    const issuedAt = new Date();

    const period = Number(input.accessTokenPeriod) || 0;
    const { requestedTTL, requestedMaxTTL } = resolveTtlInputs(
      period,
      Number(input.accessTokenTTL) || 0,
      Number(input.accessTokenMaxTTL) || 0
    );

    const creationEpoch = Math.floor(issuedAt.getTime() / 1000);
    const ttl = computeIssuedTtl({
      requestedTTL,
      maxTTL: requestedMaxTTL,
      creationEpoch,
      nowSeconds: creationEpoch
    });

    const ipRestrictionEnabled = hasNonWildcardTrustedIps(input.accessTokenTrustedIps);
    const numUsesLimit = Number(input.accessTokenNumUsesLimit) || 0;

    const baseRow = {
      identityId: input.identityId,
      isAccessTokenRevoked: false,
      accessTokenTTL: ttl,
      accessTokenMaxTTL: requestedMaxTTL,
      accessTokenNumUses: 0,
      accessTokenNumUsesLimit: numUsesLimit,
      accessTokenPeriod: period,
      authMethod: input.authMethod,
      subOrganizationId: input.subOrganizationId
    };

    let identityAccessToken: TIdentityAccessTokens;
    if (input.persistToPg) {
      identityAccessToken = await identityAccessTokenDAL.create(
        { ...baseRow, name: input.persistToPg.name ?? null },
        input.persistToPg.tx
      );
    } else {
      identityAccessToken = {
        ...baseRow,
        id: crypto.nativeCrypto.randomUUID(),
        createdAt: issuedAt,
        updatedAt: issuedAt
      };
    }

    const { accessToken } = signIdentityAccessToken({
      identityAccessTokenId: identityAccessToken.id,
      identityId: input.identityId,
      identityName: input.identityName,
      authMethod: input.authMethod,
      orgId: input.orgId,
      rootOrgId: input.rootOrgId,
      parentOrgId: input.parentOrgId,
      clientSecretId: input.clientSecretId ?? "",
      numUsesLimit,
      ipRestrictionEnabled,
      ttlSeconds: ttl,
      // Store the original configured value (not the ceiling-capped computed TTL)
      // so that renewals re-apply configMaxTTL fresh each time.
      accessTokenTTL: requestedTTL,
      accessTokenMaxTTL: requestedMaxTTL,
      accessTokenPeriod: period,
      creationEpoch,
      identityAuth: input.identityAuth
    });

    if (numUsesLimit > 0) {
      await setUsesRemaining(
        input.identityId,
        identityAccessToken.id,
        numUsesLimit,
        appCfg.MAX_MACHINE_IDENTITY_TOKEN_AGE
      );
    }

    return { accessToken, identityAccessToken };
  };

  // Loads the auth/renew context for a legacy JWT from PG. Legacy tokens predate
  // the lazy-insert model and always have a row; revoked or missing rows mean
  // the token can't be safely upgraded. Auth uses a subset of these fields.
  const loadLegacyTokenSource = async (decoded: TMinimalRenewClaims): Promise<TRenewSource> => {
    // Qualify the column — the DAL joins with Identity which also has an `id`,
    // so an unprefixed filter is ambiguous and the DB rejects the query.
    const row = await identityAccessTokenDAL.findOne({
      [`${TableName.IdentityAccessToken}.id` as "id"]: decoded.identityAccessTokenId
    });
    if (!row || row.isAccessTokenRevoked) {
      throw new UnauthorizedError({ message: "Cannot renew revoked or unknown access token" });
    }
    const fallbackOrgId = decoded.orgId ?? row.identityOrgId ?? "";
    return {
      authMethod: row.authMethod as IdentityAuthMethod,
      accessTokenTTL: row.accessTokenTTL,
      accessTokenMaxTTL: row.accessTokenMaxTTL,
      accessTokenPeriod: row.accessTokenPeriod,
      // Anchor the upgraded JWT's maxTTL budget on the row's createdAt so the
      // legacy lifetime carries over without a free renewal-time extension.
      creationEpoch: Math.floor(row.createdAt.getTime() / 1000),
      identityName: row.identityName ?? decoded.identityName ?? "",
      orgId: fallbackOrgId,
      rootOrgId: decoded.rootOrgId ?? fallbackOrgId,
      parentOrgId: decoded.parentOrgId ?? fallbackOrgId,
      clientSecretId: decoded.clientSecretId ?? "",
      numUsesLimit: row.accessTokenNumUsesLimit,
      identityAuth: decoded.identityAuth
    };
  };

  const fnValidateIdentityAccessTokenFast = async (rawToken: TIdentityAccessTokenJwtPayload, ipAddress?: string) => {
    const appCfg = getConfig();
    const token = assertMinimalRenewClaims(rawToken);
    const tokenId = token.jti ?? token.identityAccessTokenId;
    const source: TRenewSource = hasFullRenewClaims(token)
      ? {
          authMethod: token.authMethod,
          accessTokenTTL: token.accessTokenTTL,
          accessTokenMaxTTL: token.accessTokenMaxTTL,
          accessTokenPeriod: token.accessTokenPeriod,
          creationEpoch: token.creationEpoch,
          identityName: token.identityName ?? "",
          orgId: token.orgId,
          rootOrgId: token.rootOrgId,
          parentOrgId: token.parentOrgId,
          clientSecretId: token.clientSecretId,
          numUsesLimit: token.numUsesLimit ?? 0,
          identityAuth: token.identityAuth
        }
      : await loadLegacyTokenSource(token);

    // Legacy tokens (pre-redesign) may have no `exp`. Start the max-age clock
    // at the enforcement deployment date so old tokens get a communication window.
    // New tokens always have `exp`; jwt.verify already rejected expired ones.
    const issuedAtMs = token.iat * 1000;
    if (
      hasLegacyTokenWithoutExpExceededMaxAge({
        exp: token.exp,
        enforcedAt: appCfg.LEGACY_IDENTITY_ACCESS_TOKEN_EXPIRATION_ENFORCED_AT,
        maxAgeSeconds: appCfg.MAX_MACHINE_IDENTITY_TOKEN_AGE
      })
    ) {
      throw new UnauthorizedError({ message: "Identity access token exceeded max age, please re-authenticate" });
    }

    const [, usesRemainingRaw] = await Promise.all([
      assertTokenIsNotRevoked({
        tokenId,
        identityId: token.identityId,
        issuedAtMs
      }),
      keyStore.getItem(KeyStorePrefixes.IdentityTokenUsesRemaining(token.identityId, tokenId))
    ]);

    // null means unlimited or the Redis counter was lost; <= 0 means exhausted.
    const remainingFromState = parseUsesRemaining(usesRemainingRaw);
    if (remainingFromState !== null && remainingFromState <= 0) {
      throw new UnauthorizedError({ message: "Failed to authorize: token usage limit reached" });
    }

    const numUsesLimit = token.numUsesLimit ?? source.numUsesLimit;

    if (numUsesLimit > 0) {
      if (remainingFromState === null) {
        // Counter was lost (Redis flush). Re-seed from the JWT's numUsesLimit claim
        // and allow this request; subsequent requests decrement the live counter.
        await setUsesRemaining(token.identityId, tokenId, numUsesLimit - 1, appCfg.MAX_MACHINE_IDENTITY_TOKEN_AGE);
      } else {
        const remaining = await keyStore.incrementBy(
          KeyStorePrefixes.IdentityTokenUsesRemaining(token.identityId, tokenId),
          -1
        );
        if (remaining < 0) {
          throw new UnauthorizedError({ message: "Failed to authorize: token usage limit reached" });
        }
      }
    }

    if (ipAddress) {
      const trustedIps = await identityDAL.getTrustedIpsByAuthMethod(token.identityId, source.authMethod);
      if (hasNonWildcardTrustedIps(trustedIps as TIp[] | null | undefined)) {
        checkIPAgainstBlocklist({
          ipAddress,
          trustedIps: trustedIps as TIp[]
        });
      }
    }

    const orgMembership = await orgDAL.findEffectiveOrgMembership({
      actorType: ActorType.IDENTITY,
      actorId: token.identityId,
      orgId: source.orgId,
      status: OrgMembershipStatus.Accepted
    });
    if (!orgMembership) {
      throw new UnauthorizedError({ message: "Identity is not a member of the organization" });
    }
    if (!orgMembership.isActive) {
      throw new UnauthorizedError({ message: "Identity organization membership is inactive" });
    }

    return {
      identityId: token.identityId,
      identityName: source.identityName,
      name: source.identityName,
      orgId: source.orgId,
      rootOrgId: source.rootOrgId,
      parentOrgId: source.parentOrgId,
      orgName: undefined as string | undefined,
      authMethod: source.authMethod
    };
  };

  const renewAccessToken = async ({ accessToken }: TRenewAccessTokenDTO) => {
    const appCfg = getConfig();
    const decodedToken = assertMinimalRenewClaims(verifyAccessTokenJwt(accessToken));

    // Single-JWT max age for legacy tokens without exp. New-format validation
    // uses JWT exp; no-exp legacy tokens get a deployment-anchored grace window.
    if (
      hasLegacyTokenWithoutExpExceededMaxAge({
        exp: decodedToken.exp,
        enforcedAt: appCfg.LEGACY_IDENTITY_ACCESS_TOKEN_EXPIRATION_ENFORCED_AT,
        maxAgeSeconds: appCfg.MAX_MACHINE_IDENTITY_TOKEN_AGE
      })
    ) {
      throw new UnauthorizedError({ message: "Identity access token exceeded max age, please re-authenticate" });
    }

    const source: TRenewSource = hasFullRenewClaims(decodedToken)
      ? {
          authMethod: decodedToken.authMethod,
          accessTokenTTL: decodedToken.accessTokenTTL,
          accessTokenMaxTTL: decodedToken.accessTokenMaxTTL,
          accessTokenPeriod: decodedToken.accessTokenPeriod,
          creationEpoch: decodedToken.creationEpoch,
          identityName: decodedToken.identityName ?? "",
          orgId: decodedToken.orgId,
          rootOrgId: decodedToken.rootOrgId,
          parentOrgId: decodedToken.parentOrgId,
          clientSecretId: decodedToken.clientSecretId,
          numUsesLimit: decodedToken.numUsesLimit ?? 0,
          identityAuth: decodedToken.identityAuth
        }
      : await loadLegacyTokenSource(decodedToken);

    const tokenId = decodedToken.jti ?? decodedToken.identityAccessTokenId;

    const [, existingUsesRemainingRaw] = await Promise.all([
      assertTokenIsNotRevoked({
        tokenId,
        identityId: decodedToken.identityId,
        issuedAtMs: decodedToken.iat * 1000,
        messagePrefix: "Cannot renew"
      }),
      keyStore.getItem(KeyStorePrefixes.IdentityTokenUsesRemaining(decodedToken.identityId, tokenId))
    ]);

    const existingRemaining = parseUsesRemaining(existingUsesRemainingRaw);
    if (existingRemaining !== null && existingRemaining <= 0) {
      throw new UnauthorizedError({ message: "Cannot renew exhausted access token" });
    }

    const { requestedTTL, requestedMaxTTL } = resolveTtlInputs(
      source.accessTokenPeriod,
      source.accessTokenTTL,
      source.accessTokenMaxTTL
    );
    const nowSeconds = Math.floor(Date.now() / 1000);
    const ttl = computeIssuedTtl({
      requestedTTL,
      maxTTL: requestedMaxTTL,
      creationEpoch: source.creationEpoch,
      nowSeconds
    });
    if (ttl <= 0) {
      throw new UnauthorizedError({ message: "Cannot renew: identity access token has reached its max TTL" });
    }

    const numUsesLimit = decodedToken.numUsesLimit ?? source.numUsesLimit;
    const ipRestrictionEnabled = Boolean(decodedToken.ipRestrictionEnabled);

    const { accessToken: renewedToken } = signIdentityAccessToken({
      identityAccessTokenId: decodedToken.identityAccessTokenId,
      identityId: decodedToken.identityId,
      identityName: source.identityName,
      authMethod: source.authMethod,
      orgId: source.orgId,
      rootOrgId: source.rootOrgId,
      parentOrgId: source.parentOrgId,
      clientSecretId: source.clientSecretId,
      numUsesLimit,
      ipRestrictionEnabled,
      ttlSeconds: ttl,
      identityAuth: source.identityAuth,
      accessTokenTTL: source.accessTokenTTL,
      accessTokenMaxTTL: source.accessTokenMaxTTL,
      accessTokenPeriod: source.accessTokenPeriod,
      creationEpoch: source.creationEpoch
    });

    // Renewed JWT keeps the same token id; PG revocation already applies. Reseed
    // the Redis counter to the current remaining budget.
    if (numUsesLimit > 0) {
      const remainingUses = existingRemaining === null ? numUsesLimit : Math.max(0, existingRemaining);
      await setUsesRemaining(decodedToken.identityId, tokenId, remainingUses, appCfg.MAX_MACHINE_IDENTITY_TOKEN_AGE);
    }

    return {
      accessToken: renewedToken,
      expiresIn: ttl,
      accessTokenMaxTTL: source.accessTokenMaxTTL
    };
  };

  const revokeAccessToken = async (accessToken: string) => {
    const appCfg = getConfig();

    const decodedToken = assertRevocableClaims(verifyAccessTokenJwt(accessToken));
    const { identityId } = decodedToken;
    const tokenId = decodedToken.jti ?? decodedToken.identityAccessTokenId;

    const source: TRenewSource = hasFullRenewClaims(decodedToken)
      ? {
          authMethod: decodedToken.authMethod,
          accessTokenTTL: decodedToken.accessTokenTTL,
          accessTokenMaxTTL: decodedToken.accessTokenMaxTTL,
          accessTokenPeriod: decodedToken.accessTokenPeriod,
          creationEpoch: decodedToken.creationEpoch,
          identityName: decodedToken.identityName ?? "",
          orgId: decodedToken.orgId,
          rootOrgId: decodedToken.rootOrgId,
          parentOrgId: decodedToken.parentOrgId,
          clientSecretId: decodedToken.clientSecretId,
          numUsesLimit: decodedToken.numUsesLimit ?? 0,
          identityAuth: decodedToken.identityAuth
        }
      : await loadLegacyTokenSource(decodedToken);

    const maxLifetimeSeconds =
      source.accessTokenMaxTTL > 0
        ? source.creationEpoch + source.accessTokenMaxTTL
        : Math.floor(Date.now() / 1000) + appCfg.MAX_MACHINE_IDENTITY_TOKEN_AGE;
    const expiresAt = new Date(maxLifetimeSeconds * 1000);

    await identityAccessTokenRevocationDAL.insertRevocation({
      id: tokenId,
      identityId,
      expiresAt
    });

    return { revokedToken: { id: decodedToken.identityAccessTokenId, identityId, isAccessTokenRevoked: true } };
  };

  // Per-token revoke from a context that doesn't have a JWT (e.g. Token Auth's
  // admin "revoke this token by id" flow). Caller computes the latest possible
  // exp and passes it as `expiresAt`; we skip the PG insert if it's already
  // in the past since no future JWT could be blocked by such a marker.
  // DON'T USE IT WITHOUT VALIDATION
  const markPerTokenRevocation = async ({
    tokenId,
    identityId,
    expiresAt
  }: {
    tokenId: string;
    identityId: string;
    expiresAt: Date;
  }) => {
    if (expiresAt.getTime() <= Date.now()) {
      return;
    }

    await identityAccessTokenRevocationDAL.insertRevocation({
      id: tokenId,
      identityId,
      expiresAt
    });
  };

  // Identity-wide revoke: any JWT with iat < this epoch is rejected on auth.
  const revokeAllTokensForIdentity = async (identityId: string) => {
    const appCfg = getConfig();
    const revokedAt = new Date();

    await identityAccessTokenRevocationDAL.insertRevocation({
      id: identityId,
      identityId,
      revokedAt,
      expiresAt: new Date(revokedAt.getTime() + appCfg.MAX_MACHINE_IDENTITY_TOKEN_AGE * 1000)
    });
  };

  return {
    issueIdentityAccessToken,
    renewAccessToken,
    revokeAccessToken,
    revokeAllTokensForIdentity,
    markPerTokenRevocation,
    fnValidateIdentityAccessTokenFast
  };
};
