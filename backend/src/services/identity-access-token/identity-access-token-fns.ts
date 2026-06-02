import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto";
import { BadRequestError, UnauthorizedError } from "@app/lib/errors";
import { TIp } from "@app/lib/ip";

import { AuthTokenType } from "../auth/auth-type";
import {
  TComputeIssuedTtlInput,
  TCoreTokenClaims,
  TIdentityAccessTokenJwtPayload,
  TMinimalRenewClaims,
  TRenewableClaims,
  TRevocableClaims,
  TSignIdentityAccessTokenInput,
  TSignIdentityAccessTokenOutput
} from "./identity-access-token-types";

export const hasNonWildcardTrustedIps = (trustedIps: TIp[] | null | undefined): boolean => {
  if (!trustedIps || trustedIps.length === 0) {
    return false;
  }
  return trustedIps.some((ip) => ip.ipAddress !== "0.0.0.0/0" && ip.ipAddress !== "::/0");
};

// Parse the per-token uses-remaining hash field. Returns null when absent or
// unparseable (treated as "no constraint"); callers reject on values <= 0.
export const parseUsesRemaining = (raw: string | null): number | null => {
  if (raw === null) {
    return null;
  }
  const parsed = parseInt(raw, 10);
  return Number.isNaN(parsed) ? null : parsed;
};

// Resolve TTL inputs into the (requestedTTL, requestedMaxTTL) pair that
// computeIssuedTtl expects. Periodic mode (period > 0) uses period as the
// effective TTL with no per-token max; standard mode passes the inputs through.
export const resolveTtlInputs = (period: number, ttl: number, maxTTL: number) => {
  if (period > 0) {
    return { requestedTTL: period, requestedMaxTTL: 0 };
  }
  return { requestedTTL: ttl, requestedMaxTTL: maxTTL };
};

// Verify the JWT signature and assert it carries the IDENTITY_ACCESS_TOKEN type
// claim. Caller still asserts the per-flow required claims via the helpers below.
export const verifyAccessTokenJwt = (accessToken: string): TIdentityAccessTokenJwtPayload => {
  const decoded = crypto.jwt().verify(accessToken, getConfig().AUTH_SECRET) as TIdentityAccessTokenJwtPayload;
  if (decoded.authTokenType !== AuthTokenType.IDENTITY_ACCESS_TOKEN) {
    throw new BadRequestError({ message: "Token is not an identity access token" });
  }
  return decoded;
};

// Pre-redesign JWTs were signed without `jti`, so `identityAccessTokenId` is the
// stable id we can rely on across both formats. Callers that need the live token
// id read `decoded.jti ?? decoded.identityAccessTokenId`.
const hasCoreTokenClaims = (decoded: TIdentityAccessTokenJwtPayload): decoded is TCoreTokenClaims =>
  typeof decoded.iat === "number" && Boolean(decoded.identityId) && Boolean(decoded.identityAccessTokenId);

// Baseline assertion shared by every JWT-consuming entry point (auth, renew,
// revoke). Per-flow predicates narrow further.
export const assertMinimalRenewClaims = (decoded: TIdentityAccessTokenJwtPayload): TMinimalRenewClaims => {
  if (!hasCoreTokenClaims(decoded)) {
    throw new UnauthorizedError({ message: "Invalid identity access token claims, please re-authenticate" });
  }
  return decoded;
};

// True when the JWT carries every claim needed to auth/renew without a PG read:
// jti + org claims + TTL/period/creationEpoch budget anchors. Legacy tokens fail
// this and fall through to loadLegacyTokenSource.
export const hasFullRenewClaims = (decoded: TMinimalRenewClaims): decoded is TRenewableClaims =>
  Boolean(decoded.jti) &&
  Boolean(decoded.orgId) &&
  Boolean(decoded.rootOrgId) &&
  Boolean(decoded.parentOrgId) &&
  Boolean(decoded.authMethod) &&
  typeof decoded.accessTokenTTL === "number" &&
  typeof decoded.accessTokenMaxTTL === "number" &&
  typeof decoded.accessTokenPeriod === "number" &&
  typeof decoded.creationEpoch === "number";

// Revoke only needs the core claims — `assertMinimalRenewClaims` is the same
// check; this alias preserves intent at the call site.
export const assertRevocableClaims = assertMinimalRenewClaims as (
  decoded: TIdentityAccessTokenJwtPayload
) => TRevocableClaims;

export const hasLegacyTokenWithoutExpExceededMaxAge = ({
  exp,
  enforcedAt,
  maxAgeSeconds,
  nowMs = Date.now()
}: {
  exp?: number;
  enforcedAt: Date;
  maxAgeSeconds: number;
  nowMs?: number;
}) => typeof exp !== "number" && nowMs > enforcedAt.getTime() + maxAgeSeconds * 1000;

// Compute the TTL (seconds) to sign the JWT with.
//
// Three caps:
//   - requestedTTL: per-issuance lifetime requested by the caller (0 = no cap).
//   - ceiling: env-enforced maximum age for any single JWT (always positive).
//     A token may live past this *via renewals* — each new JWT gets a fresh
//     ceiling-bounded exp; the ceiling does not bound total token lifetime.
//   - maxTTL: total lifetime budget across all renewals, anchored at
//     creationEpoch. At first issuance creationEpoch === nowSeconds so the
//     remaining budget equals maxTTL; on renew it shrinks as time elapses.
//     0 = no budget cap.
//
// Returns possibly <= 0 when the budget is exhausted (renew callers must
// reject this as a re-auth signal; issuance can never reach 0 because the
// ceiling is always positive and remainingBudget at issuance == maxTTL).
export const computeIssuedTtl = ({
  requestedTTL,
  maxTTL,
  creationEpoch,
  nowSeconds
}: TComputeIssuedTtlInput): number => {
  const { MAX_MACHINE_IDENTITY_TOKEN_AGE: ceiling } = getConfig();

  let requestedCap = Infinity;
  if (requestedTTL > 0) {
    requestedCap = requestedTTL;
  }

  let remainingBudget = Infinity;
  // this handles tokens with a maxTTL for renewal cases
  if (maxTTL > 0) {
    remainingBudget = creationEpoch + maxTTL - nowSeconds;
  }

  // this essentially says, give us the value that expires the soonest of:
  //  - the TTL in the token config
  //  - The remaining time that the token as a whole can be renewed for
  //  - The maximum TTL for any single token issuance (defined by env var)
  return Math.min(requestedCap, remainingBudget, ceiling);
};

export const signIdentityAccessToken = (input: TSignIdentityAccessTokenInput): TSignIdentityAccessTokenOutput => {
  const appCfg = getConfig();
  const jti = input.identityAccessTokenId;

  const payload: TIdentityAccessTokenJwtPayload = {
    identityId: input.identityId,
    identityName: input.identityName,
    authMethod: input.authMethod,
    orgId: input.orgId,
    rootOrgId: input.rootOrgId,
    parentOrgId: input.parentOrgId,
    clientSecretId: input.clientSecretId,
    identityAccessTokenId: input.identityAccessTokenId,
    ipRestrictionEnabled: input.ipRestrictionEnabled,
    accessTokenTTL: input.accessTokenTTL,
    accessTokenMaxTTL: input.accessTokenMaxTTL,
    accessTokenPeriod: input.accessTokenPeriod,
    creationEpoch: input.creationEpoch,
    authTokenType: AuthTokenType.IDENTITY_ACCESS_TOKEN,
    identityAuth: input.identityAuth ?? {}
  };

  if (input.numUsesLimit > 0) {
    payload.numUsesLimit = input.numUsesLimit;
  }

  const accessToken = crypto.jwt().sign(payload, appCfg.AUTH_SECRET, {
    jwtid: jti,
    expiresIn: input.ttlSeconds
  });

  return { accessToken, jti, expiresIn: input.ttlSeconds };
};
