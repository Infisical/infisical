import jwt, { JwtPayload } from "jsonwebtoken";
import { JwksClient } from "jwks-rsa";

import { TOidcConfigs } from "@app/db/schemas";
import { OIDCConfigurationType, OIDCJWTSignatureAlgorithm } from "@app/ee/services/oidc/oidc-config-types";
import { crypto } from "@app/lib/crypto";
import { BadRequestError, UnauthorizedError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { buildSsrfSafeAgent, safeRequest } from "@app/lib/validator/safe-request";

const SSO_TAB_HINT = "Check Settings > SSO & Provisioning.";

// HS256 is excluded because it is symmetric: the verification key is the signing key, so anyone who
// can read the JWKS could mint a token we would accept.
const ASYMMETRIC_SIGNATURE_ALGORITHMS: readonly string[] = [
  OIDCJWTSignatureAlgorithm.RS256,
  OIDCJWTSignatureAlgorithm.RS512,
  OIDCJWTSignatureAlgorithm.EDDSA
];

const WELL_KNOWN_OPENID_CONFIGURATION = "/.well-known/openid-configuration";

// Mirrors what openid-client's Issuer.discover accepts, so a configuration that works for browser SSO
// login resolves the same way here: a discovery URL may already point at the document, or be the
// issuer base that the well-known path hangs off.
const buildDiscoveryDocumentUrl = (discoveryUrl: string) => {
  const url = new URL(discoveryUrl);
  if (url.pathname.includes("/.well-known/")) return url.toString();

  url.pathname = `${url.pathname.replace(/\/$/, "")}${WELL_KNOWN_OPENID_CONFIGURATION}`;
  return url.toString();
};

// jwks-rsa caches signing keys per instance, so reusing one per JWKS URI keeps a network fetch off the
// hot path. Token exchange runs on every request the middleware makes.
//
// Entries expire so the agent's pinned IPs are rebuilt periodically. Without that, a legitimate DNS
// change at the identity provider would not be picked up for the lifetime of the process.
const JWKS_CLIENT_TTL_MS = 10 * 60 * 1000;
const MAX_CACHED_JWKS_CLIENTS = 512;
const jwksClientCache = new Map<string, { client: JwksClient; expiresAt: number }>();

const getJwksClient = async (jwksUri: string) => {
  const now = Date.now();
  const cached = jwksClientCache.get(jwksUri);
  if (cached && cached.expiresAt > now) return cached.client;

  if (jwksClientCache.size >= MAX_CACHED_JWKS_CLIENTS) jwksClientCache.clear();

  const requestAgent = await buildSsrfSafeAgent(jwksUri, { keepAlive: true });

  const client = new JwksClient({
    jwksUri,
    requestAgent,
    cache: true,
    cacheMaxEntries: 5,
    cacheMaxAge: JWKS_CLIENT_TTL_MS,
    rateLimit: true,
    jwksRequestsPerMinute: 30,
    timeout: 10_000
  });

  jwksClientCache.set(jwksUri, { client, expiresAt: now + JWKS_CLIENT_TTL_MS });
  return client;
};

export type TOidcTrustAnchor = {
  issuer: string;
  jwksUri: string;
  algorithm: string;
};

// Uses the same configuration that governs browser SSO login, so the issuers that can vouch for a user
// through token exchange are exactly those that can already log them in.
export const resolveOidcTrustAnchor = async (oidcConfig: TOidcConfigs): Promise<TOidcTrustAnchor> => {
  const algorithm = oidcConfig.jwtSignatureAlgorithm || OIDCJWTSignatureAlgorithm.RS256;

  if (!ASYMMETRIC_SIGNATURE_ALGORITHMS.includes(algorithm)) {
    throw new BadRequestError({
      message: `Token exchange requires an OIDC SSO configuration that uses an asymmetric JWT signature algorithm, but yours uses '${algorithm}'. Switch it to one of ${ASYMMETRIC_SIGNATURE_ALGORITHMS.join(", ")}. ${SSO_TAB_HINT}`
    });
  }

  if (oidcConfig.configurationType === OIDCConfigurationType.DISCOVERY_URL) {
    if (!oidcConfig.discoveryURL) {
      throw new BadRequestError({
        message: `Your organization's OIDC SSO configuration has no discovery URL, so the identity provider's signing keys cannot be located. ${SSO_TAB_HINT}`
      });
    }

    let metadata: { jwks_uri?: string; issuer?: string };
    try {
      const { data } = await safeRequest.get<{ jwks_uri?: string; issuer?: string }>(
        buildDiscoveryDocumentUrl(oidcConfig.discoveryURL),
        { timeout: 10_000 }
      );
      metadata = data;
    } catch (error) {
      logger.error(
        { error, orgId: oidcConfig.orgId },
        `OIDC discovery failed during token exchange [orgId=${oidcConfig.orgId}]`
      );
      throw new BadRequestError({
        message: `Could not reach your organization's identity provider to load its signing keys. ${SSO_TAB_HINT}`
      });
    }

    const jwksUri = metadata.jwks_uri;
    if (!jwksUri) {
      throw new BadRequestError({
        message: `Your organization's identity provider did not publish a 'jwks_uri' in its discovery document, so subject tokens cannot be verified. ${SSO_TAB_HINT}`
      });
    }

    const issuer = oidcConfig.issuer || metadata.issuer;
    if (!issuer) {
      throw new BadRequestError({
        message: `Your organization's identity provider did not publish an issuer in its discovery document. ${SSO_TAB_HINT}`
      });
    }

    return { issuer, jwksUri, algorithm };
  }

  if (!oidcConfig.issuer || !oidcConfig.jwksUri) {
    throw new BadRequestError({
      message: `Your organization's OIDC SSO configuration is missing an issuer or JWKS URI, so subject tokens cannot be verified. ${SSO_TAB_HINT}`
    });
  }

  return { issuer: oidcConfig.issuer, jwksUri: oidcConfig.jwksUri, algorithm };
};

// jsonwebtoken reports failures with terse developer-facing text ("jwt audience invalid"). Translate to
// something the caller can act on without leaking the raw message.
const toSubjectTokenError = (error: unknown, anchor: TOidcTrustAnchor, expectedAudience: string) => {
  if (error instanceof jwt.TokenExpiredError) {
    return new UnauthorizedError({ message: "The subject token has expired." });
  }

  if (error instanceof jwt.NotBeforeError) {
    return new UnauthorizedError({ message: "The subject token is not valid yet (its 'nbf' claim is in the future)." });
  }

  if (error instanceof jwt.JsonWebTokenError) {
    const reason = error.message;

    if (reason.includes("audience")) {
      return new UnauthorizedError({
        message: `The subject token's audience does not match this application's configured token exchange audience ('${expectedAudience}').`
      });
    }

    if (reason.includes("issuer")) {
      return new UnauthorizedError({
        message: `The subject token was not issued by your organization's configured OIDC SSO issuer ('${anchor.issuer}').`
      });
    }

    if (reason.includes("algorithm")) {
      return new UnauthorizedError({
        message: `The subject token is not signed with the algorithm your organization's OIDC SSO configuration expects ('${anchor.algorithm}').`
      });
    }

    return new UnauthorizedError({
      message: "The subject token could not be verified against your organization's identity provider."
    });
  }

  return null;
};

type TVerifySubjectTokenDTO = {
  subjectToken: string;
  oidcConfig: TOidcConfigs;
  expectedAudience: string;
};

// Every check deciding whether we believe this token describes this user lives here: signature, issuer,
// audience, expiry, not-before and algorithm.
export const verifySubjectToken = async ({ subjectToken, oidcConfig, expectedAudience }: TVerifySubjectTokenDTO) => {
  const anchor = await resolveOidcTrustAnchor(oidcConfig);

  const decoded = crypto.jwt().decode(subjectToken, { complete: true });
  if (!decoded) {
    throw new UnauthorizedError({ message: "The subject token is not a well-formed JWT." });
  }

  const { kid } = decoded.header;
  if (!kid) {
    throw new UnauthorizedError({
      message:
        "The subject token has no 'kid' header, so the signing key to verify it with cannot be identified. Configure your identity provider to include a key id."
    });
  }

  let signingKey;
  try {
    const jwksClient = await getJwksClient(anchor.jwksUri);
    signingKey = await jwksClient.getSigningKey(kid);
  } catch (error) {
    logger.error(
      { error, orgId: oidcConfig.orgId, kid },
      `Subject token signing key lookup failed during token exchange [orgId=${oidcConfig.orgId}] [kid=${kid}]`
    );

    if (error instanceof Error && error.name === "SigningKeyNotFoundError") {
      throw new UnauthorizedError({
        message: `The subject token was signed with a key ('${kid}') that your organization's identity provider does not publish. The token may be from a different provider, or the provider's keys may have rotated.`
      });
    }

    throw new BadRequestError({
      message: `Could not load signing keys from your organization's identity provider. ${SSO_TAB_HINT}`
    });
  }

  let claims: JwtPayload;
  try {
    claims = crypto.jwt().verify(subjectToken, signingKey.getPublicKey(), {
      issuer: anchor.issuer,
      audience: expectedAudience,
      algorithms: [anchor.algorithm as jwt.Algorithm]
    }) as JwtPayload;
  } catch (error) {
    logger.error(
      { error, orgId: oidcConfig.orgId },
      `Subject token verification failed during token exchange [orgId=${oidcConfig.orgId}]`
    );
    throw toSubjectTokenError(error, anchor, expectedAudience) ?? error;
  }

  if (!claims.sub) {
    throw new UnauthorizedError({
      message: "The subject token has no 'sub' claim, so it does not identify a user."
    });
  }

  return { subject: claims.sub, issuer: anchor.issuer };
};
