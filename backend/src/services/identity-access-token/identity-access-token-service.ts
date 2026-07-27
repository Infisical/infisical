import { Knex } from "knex";

import { IdentityAuthMethod, OrgMembershipStatus, TableName, TIdentityAccessTokens } from "@app/db/schemas";
import { KeyStorePrefixes, KeyStoreTtls, TKeyStoreFactory } from "@app/keystore/keystore";
import { withCache } from "@app/lib/cache/with-cache";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto";
import { applyJitter } from "@app/lib/dates";
import { delay } from "@app/lib/delay";
import { UnauthorizedError } from "@app/lib/errors";
import { checkIPAgainstBlocklist, TIp } from "@app/lib/ip";
import { logger } from "@app/lib/logger";
import { recordTokenRenewalMetric } from "@app/lib/telemetry/metrics";

import { ActorType } from "../auth/auth-type";
import { TIdentityDALFactory } from "../identity/identity-dal";
import { TOrgDALFactory } from "../org/org-dal";
import { TIdentityAccessTokenDALFactory } from "./identity-access-token-dal";
import {
  assertMinimalRenewClaims,
  assertRevocableClaims,
  computeIssuedTtl,
  computePerTokenMarkerExpiry,
  computeRevocationVerdictFingerprint,
  evaluateRevocationMarkers,
  hasFullRenewClaims,
  hasLegacyTokenWithoutExpExceededMaxAge,
  hasNonWildcardTrustedIps,
  isMembershipDenyReason,
  parseUsesRemaining,
  resolveTtlInputs,
  revocationDenyReasonToMessage,
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
  TRenewSource,
  TRevocationDenyReason
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
  orgDAL: Pick<TOrgDALFactory, "findEffectiveOrgMembership" | "findOne">;
  keyStore: Pick<
    TKeyStoreFactory,
    | "getItem"
    | "getItemPrimary"
    | "incrementBy"
    | "setItemWithExpiry"
    | "setItemWithExpiryNX"
    | "incrementSeededWithExpiry"
    | "deleteItem"
  >;
};

type TTrustedIpsCachePayload = {
  accessTokenTrustedIps: TIp[] | null;
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

  // Delayed re-delete: a request that missed cache before this delete can still
  // write a stale allowlist back. Second delete ~1s later helps with race conditions, but still best effort.
  const TRUSTED_IPS_CACHE_REDELETE_DELAY_MS = 1000;

  const invalidateTrustedIpsCache = async (identityId: string, authMethod: IdentityAuthMethod | string) => {
    const key = KeyStorePrefixes.IdentityTrustedIps(identityId, authMethod);
    try {
      await keyStore.deleteItem(key);
    } catch (error) {
      logger.warn(error, `identity-trusted-ips: failed to invalidate cache [identityId=${identityId}]`);
    }

    void delay(TRUSTED_IPS_CACHE_REDELETE_DELAY_MS)
      .then(() => keyStore.deleteItem(key))
      .catch((error) => {
        logger.warn(error, `identity-trusted-ips: failed delayed re-delete [identityId=${identityId}]`);
      });
  };

  // On revoke, bump this identity's version number. Every cached "allowed" answer
  // remembers the version it was written under, so one bump instantly makes them
  // all stale. Run it after the revocation record is saved and outside any
  // transaction, so a request reading in parallel can't cache an allow under the
  // old version.
  const bumpRevocationVersion = async (identityId: string) => {
    try {
      const versionKey = KeyStorePrefixes.IdentityRevocationVersion(identityId);
      await keyStore.incrementSeededWithExpiry(versionKey, Date.now(), KeyStoreTtls.IdentityRevocationVersionInSeconds);
    } catch (error) {
      logger.warn(error, `identity-revocation: failed to bump version [identityId=${identityId}]`);
    }
  };

  // Reads this identity's current version number, creating it (from the current
  // time) if it doesn't exist yet. Returns null only when the cache is down,
  // which tells the caller not to store an "allowed" answer.
  const getOrSeedRevocationVersion = async (identityId: string): Promise<number | null> => {
    const versionKey = KeyStorePrefixes.IdentityRevocationVersion(identityId);
    // Read the version from the primary, never a replica, so a revoke's bump is
    // always observed here (see assertTokenIsNotRevoked).
    const existing = await keyStore.getItemPrimary(versionKey);
    if (existing !== null) {
      return Number(existing);
    }

    // Only set it if still missing, so a concurrent revoke's bump wins; then read
    // back whatever value stuck.
    await keyStore.setItemWithExpiryNX(versionKey, KeyStoreTtls.IdentityRevocationVersionInSeconds, Date.now());
    const seeded = await keyStore.getItemPrimary(versionKey);
    return seeded === null ? null : Number(seeded);
  };

  // A cached "allowed" answer is only trusted while the identity's version
  // number still matches, so a revoke instantly invalidates it without ever
  // storing the set of revocation records. A cached "denied" answer from a
  // revocation needs no version check and stands for its whole lifetime,
  // because a revocation record always outlives any token it can block.
  //
  // Org membership is folded into this path: on a cache miss / version change we
  // re-check membership in Postgres; on a stamped allow hit we skip that query.
  // Membership denies are reversible (re-add / reactivate), so they are
  // version-stamped like allows and only trusted while the version matches;
  // restoring membership bumps the version to force an immediate re-check.
  const assertTokenIsNotRevoked = async ({
    tokenId,
    identityId,
    issuedAtMs,
    clientSecretId,
    authMethod,
    orgId,
    messagePrefix = "Failed to authorize"
  }: {
    tokenId: string;
    identityId: string;
    issuedAtMs: number;
    clientSecretId?: string;
    authMethod?: string;
    orgId?: string;
    messagePrefix?: "Failed to authorize" | "Cannot renew";
  }) => {
    const scopes: string[] = [];
    if (clientSecretId) scopes.push(clientSecretId);
    if (authMethod) scopes.push(authMethod);
    if (orgId) scopes.push(orgId);

    const fingerprint = computeRevocationVerdictFingerprint({ tokenId, issuedAtMs, clientSecretId, authMethod });
    const verdictKey = KeyStorePrefixes.IdentityRevocationVerdict(identityId, fingerprint);
    const versionKey = KeyStorePrefixes.IdentityRevocationVersion(identityId);

    let cacheAvailable = true;
    let cachedVersion: number | null = null;
    let cachedVerdictRaw: string | null = null;

    try {
      // Two separate reads (not MGET) to stay Redis-Cluster-safe. The version is
      // read from the primary, never a replica.
      const [versionRaw, verdictRaw] = await Promise.all([
        keyStore.getItemPrimary(versionKey),
        keyStore.getItem(verdictKey)
      ]);
      cachedVersion = versionRaw === null ? null : Number(versionRaw);
      cachedVerdictRaw = verdictRaw;
    } catch (error) {
      cacheAvailable = false;
      logger.warn(error, `identity-revocation: verdict cache read failed, falling back to primary`);
    }

    if (cacheAvailable && cachedVerdictRaw) {
      let parsed: { v?: number; deny?: TRevocationDenyReason } | null = null;
      try {
        parsed = JSON.parse(cachedVerdictRaw) as { v?: number; deny?: TRevocationDenyReason };
      } catch {
        parsed = null;
      }

      if (parsed?.deny) {
        // A membership deny is only honored while its stamped version matches the
        // live one; a stale one falls through to the cold path and re-checks.
        const denyIsCurrent =
          !isMembershipDenyReason(parsed.deny) ||
          (typeof parsed.v === "number" && cachedVersion !== null && parsed.v === cachedVersion);
        if (denyIsCurrent) {
          throw new UnauthorizedError({ message: revocationDenyReasonToMessage(parsed.deny, messagePrefix) });
        }
      }
      // An allow only holds while the stamped version still matches the live one.
      if (parsed && typeof parsed.v === "number" && cachedVersion !== null && parsed.v === cachedVersion) {
        return;
      }
    }

    // Resolve the version to stamp before the fill so a concurrent revoke's bump
    // follows it and invalidates this allow.
    let versionForStamp: number | null = null;
    if (cacheAvailable) {
      try {
        versionForStamp = cachedVersion !== null ? cachedVersion : await getOrSeedRevocationVersion(identityId);
      } catch (error) {
        cacheAvailable = false;
        logger.warn(error, `identity-revocation: version resolve failed, falling back to primary`);
      }
    }

    const activeRevocations = await identityAccessTokenRevocationDAL.findActiveRevocationsForToken({
      tokenId,
      identityId,
      scopes
    });

    let denyReason = evaluateRevocationMarkers({
      markers: activeRevocations,
      tokenId,
      identityId,
      issuedAtMs,
      clientSecretId,
      authMethod,
      orgId
    });

    // Cold-path membership check. Skipped on a stamped allow hit above; after a
    // version bump every live token rechecks once, and only org-scoped markers
    // deny (other orgs re-allow and re-cache).
    if (!denyReason && orgId) {
      const orgMembership = await orgDAL.findEffectiveOrgMembership({
        actorType: ActorType.IDENTITY,
        actorId: identityId,
        orgId,
        status: OrgMembershipStatus.Accepted
      });
      if (!orgMembership) {
        denyReason = "org-membership";
      } else if (!orgMembership.isActive) {
        denyReason = "org-membership-inactive";
      }
    }

    if (cacheAvailable) {
      try {
        const ttl = applyJitter(
          KeyStoreTtls.IdentityRevocationVerdictBaseInSeconds,
          KeyStoreTtls.IdentityRevocationVerdictJitterInSeconds
        );
        if (denyReason && !isMembershipDenyReason(denyReason)) {
          await keyStore.setItemWithExpiry(verdictKey, ttl, JSON.stringify({ deny: denyReason }));
        } else if (denyReason) {
          // Version-stamped so restoring membership (bump) invalidates it instantly.
          if (versionForStamp !== null) {
            await keyStore.setItemWithExpiry(verdictKey, ttl, JSON.stringify({ deny: denyReason, v: versionForStamp }));
          }
        } else if (versionForStamp !== null) {
          await keyStore.setItemWithExpiry(verdictKey, ttl, JSON.stringify({ v: versionForStamp }));
        }
      } catch (error) {
        logger.warn(error, `identity-revocation: verdict cache write failed [identityId=${identityId}]`);
      }
    }

    if (denyReason) {
      throw new UnauthorizedError({ message: revocationDenyReasonToMessage(denyReason, messagePrefix) });
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

    const scopeOrgId = row.subOrganizationId || row.identityOrgId;
    const identityOrgDetails = await orgDAL.findOne({ id: scopeOrgId });
    const isSubOrg = Boolean(identityOrgDetails.rootOrgId);
    const rootOrgId = isSubOrg ? identityOrgDetails.rootOrgId || identityOrgDetails.id : identityOrgDetails.id;
    const parentOrgId = identityOrgDetails.parentOrgId || rootOrgId;

    return {
      authMethod: row.authMethod as IdentityAuthMethod,
      accessTokenTTL: row.accessTokenTTL,
      accessTokenMaxTTL: row.accessTokenMaxTTL,
      accessTokenPeriod: row.accessTokenPeriod,
      // Anchor the upgraded JWT's maxTTL budget on the row's createdAt so the
      // legacy lifetime carries over without a free renewal-time extension.
      creationEpoch: Math.floor(row.createdAt.getTime() / 1000),
      identityName: row.identityName ?? decoded.identityName ?? "",
      orgId: decoded?.orgId || scopeOrgId,
      rootOrgId: decoded.rootOrgId ?? rootOrgId,
      parentOrgId: decoded.parentOrgId ?? parentOrgId,
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
        issuedAtMs,
        clientSecretId: source.clientSecretId,
        authMethod: source.authMethod,
        orgId: source.orgId
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
      const { accessTokenTrustedIps: trustedIps } = await withCache<TTrustedIpsCachePayload>({
        // A Redis read replica can lag behind the primary's DEL on invalidation and serve a stale allowlist
        keyStore: {
          getItem: (key, prefix) => keyStore.getItemPrimary(key, prefix),
          setItemWithExpiry: keyStore.setItemWithExpiry
        },
        key: KeyStorePrefixes.IdentityTrustedIps(token.identityId, source.authMethod),
        ttlSeconds: KeyStoreTtls.IdentityTrustedIpsInSeconds,
        fetcher: async () => {
          const ips = await identityDAL.getTrustedIpsByAuthMethod(token.identityId, source.authMethod);
          return { accessTokenTrustedIps: (ips as TIp[] | null | undefined) ?? null };
        }
      });
      if (hasNonWildcardTrustedIps(trustedIps)) {
        checkIPAgainstBlocklist({
          ipAddress,
          trustedIps: trustedIps as TIp[]
        });
      }
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

  const renewAccessTokenInner = async ({ accessToken }: TRenewAccessTokenDTO) => {
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
        clientSecretId: source.clientSecretId,
        authMethod: source.authMethod,
        orgId: source.orgId,
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

  const renewAccessToken = async (dto: TRenewAccessTokenDTO) => {
    try {
      const result = await renewAccessTokenInner(dto);
      recordTokenRenewalMetric({ outcome: "success" });
      return result;
    } catch (error) {
      recordTokenRenewalMetric({ outcome: "failure", error });
      throw error;
    }
  };

  const revokeAccessToken = async (accessToken: string) => {
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

    // Cap the marker at the latest exp of any JWT it must block so it self-drains
    // within a token TTL rather than the full maxTTL window.
    const expiresAt = computePerTokenMarkerExpiry({
      exp: decodedToken.exp,
      requestedTTL: source.accessTokenTTL,
      accessTokenMaxTTL: source.accessTokenMaxTTL,
      accessTokenPeriod: source.accessTokenPeriod,
      creationEpoch: source.creationEpoch
    });

    await identityAccessTokenRevocationDAL.insertRevocation({
      id: tokenId,
      identityId,
      expiresAt
    });
    await bumpRevocationVersion(identityId);

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
    await bumpRevocationVersion(identityId);
  };

  // Identity-wide revoke marker: any JWT with iat < this epoch is rejected on
  // auth. Uses the 90d fallback since it is one marker per deleted identity.
  const insertIdentityWideRevocationMarker = async ({ identityId, tx }: { identityId: string; tx?: Knex }) => {
    const appCfg = getConfig();
    const revokedAt = new Date();

    await identityAccessTokenRevocationDAL.insertRevocation(
      {
        id: identityId,
        identityId,
        revokedAt,
        expiresAt: new Date(revokedAt.getTime() + appCfg.MAX_MACHINE_IDENTITY_TOKEN_AGE * 1000)
      },
      tx
    );
  };

  const revokeAllTokensForIdentity = async (identityId: string) => {
    await insertIdentityWideRevocationMarker({ identityId });
    await bumpRevocationVersion(identityId);
  };

  // Scoped revoke for Universal Auth client secret deletion: rejects every JWT
  // carrying this clientSecretId with iat < revokedAt. Stored in the polymorphic
  // revocation table with a synthetic id and scope = clientSecretId.
  const revokeAllTokensForClientSecret = async ({
    identityId,
    clientSecretId
  }: {
    identityId: string;
    clientSecretId: string;
  }) => {
    const appCfg = getConfig();
    const revokedAt = new Date();

    await identityAccessTokenRevocationDAL.insertRevocation({
      id: crypto.nativeCrypto.randomUUID(),
      identityId,
      scope: clientSecretId,
      revokedAt,
      expiresAt: new Date(revokedAt.getTime() + appCfg.MAX_MACHINE_IDENTITY_TOKEN_AGE * 1000)
    });
    await bumpRevocationVersion(identityId);
  };

  // Scoped revoke for auth-method removal: rejects every JWT issued via the
  // removed method with iat < revokedAt. Tokens issued via other methods on
  // the same identity stay valid.
  const revokeTokensForIdentityAuthMethod = async ({
    identityId,
    authMethod
  }: {
    identityId: string;
    authMethod: IdentityAuthMethod;
  }) => {
    const appCfg = getConfig();
    const revokedAt = new Date();

    await identityAccessTokenRevocationDAL.insertRevocation({
      id: crypto.nativeCrypto.randomUUID(),
      identityId,
      scope: authMethod,
      revokedAt,
      expiresAt: new Date(revokedAt.getTime() + appCfg.MAX_MACHINE_IDENTITY_TOKEN_AGE * 1000)
    });
    await bumpRevocationVersion(identityId);
  };

  // Org-scoped revoke marker for membership deactivate / remove-from-org: rejects
  // every JWT for this identity whose orgId claim matches, with iat < revokedAt.
  // Tokens scoped to other orgs (sub-org hierarchy) stay valid. Accepts the caller's
  // tx so the marker commits atomically with the membership mutation, making it the
  // durable source of truth for the deny (see bumpIdentityRevocationVersion).
  const insertOrgMembershipRevocationMarker = async ({
    identityId,
    orgId,
    tx
  }: {
    identityId: string;
    orgId: string;
    tx?: Knex;
  }) => {
    const appCfg = getConfig();
    const revokedAt = new Date();

    await identityAccessTokenRevocationDAL.insertRevocation(
      {
        id: crypto.nativeCrypto.randomUUID(),
        identityId,
        scope: orgId,
        revokedAt,
        expiresAt: new Date(revokedAt.getTime() + appCfg.MAX_MACHINE_IDENTITY_TOKEN_AGE * 1000)
      },
      tx
    );
  };

  // Inverse of insertOrgMembershipRevocationMarker, for restoring org access (membership re-added or reactivated)
  const removeOrgMembershipRevocationMarkers = async ({
    identityId,
    orgId,
    tx
  }: {
    identityId: string;
    orgId: string;
    tx?: Knex;
  }) => {
    await identityAccessTokenRevocationDAL.deleteRevocationsByScope({ identityId, scope: orgId }, tx);
  };

  // Best-effort cache accelerator: bumps the version so cached allow verdicts are
  // rechecked once. A failed bump only defers enforcement to the verdict TTL, since the committed
  // membership row (and marker) remain the durable deny that the cold path reads.
  const bumpIdentityRevocationVersion = async ({ identityId }: { identityId: string }) => {
    await bumpRevocationVersion(identityId);
  };

  return {
    issueIdentityAccessToken,
    renewAccessToken,
    insertIdentityWideRevocationMarker,
    revokeAccessToken,
    revokeAllTokensForIdentity,
    revokeAllTokensForClientSecret,
    revokeTokensForIdentityAuthMethod,
    insertOrgMembershipRevocationMarker,
    removeOrgMembershipRevocationMarkers,
    bumpIdentityRevocationVersion,
    markPerTokenRevocation,
    invalidateTrustedIpsCache,
    fnValidateIdentityAccessTokenFast
  };
};
