import { decodeProtectedHeader, errors as joseErrors, importSPKI, JWTPayload, jwtVerify } from "jose";
import { JwksClient } from "jwks-rsa";

import { TOidcConfigs } from "@app/db/schemas";
import { OIDCConfigurationType, OIDCJWTSignatureAlgorithm } from "@app/ee/services/oidc/oidc-config-types";
import { UnauthorizedError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { buildSsrfSafeAgent, safeRequest } from "@app/lib/validator/safe-request";

import { OauthTokenError, OauthTokenErrorCode } from "./oauth-token-error";

const SSO_TAB_HINT = "Check Settings > SSO & Provisioning.";

// HS256 is left out because it's symmetric: the verification key is the signing key, so anyone who can
// read the JWKS could mint a token we'd accept.
const ASYMMETRIC_SIGNATURE_ALGORITHMS: readonly string[] = [
  OIDCJWTSignatureAlgorithm.RS256,
  OIDCJWTSignatureAlgorithm.RS512,
  OIDCJWTSignatureAlgorithm.EDDSA
];

const WELL_KNOWN_OPENID_CONFIGURATION = "/.well-known/openid-configuration";

// Mirrors what openid-client's Issuer.discover accepts, so a config that works for browser SSO login
// resolves the same way here: the URL may already point at the document, or be the issuer base.
const buildDiscoveryDocumentUrl = (discoveryUrl: string) => {
  const url = new URL(discoveryUrl);
  if (url.pathname.includes("/.well-known/")) return url.toString();

  url.pathname = `${url.pathname.replace(/\/$/, "")}${WELL_KNOWN_OPENID_CONFIGURATION}`;
  return url.toString();
};

type TOidcDiscoveryMetadata = { jwks_uri?: string; issuer?: string };

// Entries hold the in-flight promise so concurrent callers on a cold entry coalesce onto one fetch.
// Rejections are dropped rather than cached, or a 5-second provider blip becomes 10 minutes of them. A
// full cache is cleared wholesale: the bound caps memory, it is not a real LRU.
const createTtlCache = <T>({ ttlMs, maxEntries }: { ttlMs: number; maxEntries: number }) => {
  const entries = new Map<string, { value: Promise<T>; expiresAt: number }>();

  const getOrCreate = (key: string, create: () => Promise<T>) => {
    const now = Date.now();
    const cached = entries.get(key);
    if (cached && cached.expiresAt > now) return cached.value;

    if (entries.size >= maxEntries) entries.clear();

    const value = create();
    entries.set(key, { value, expiresAt: now + ttlMs });

    value.catch(() => {
      if (entries.get(key)?.value === value) entries.delete(key);
    });

    return value;
  };

  return { getOrCreate };
};

// Keyed on the URL, not the org, so orgs on a shared provider share an entry and an admin fixing a
// typo'd URL moves to a new key instead of waiting out the TTL.
const MAX_CACHED_PROVIDER_URLS = 512;
const DISCOVERY_METADATA_TTL_MS = 10 * 60 * 1000;
const JWKS_CLIENT_TTL_MS = 10 * 60 * 1000;

// A middleware may exchange on every request, and without this cache that makes the identity provider a
// synchronous dependency of every Infisical call it serves. Only the fetch is cached, never the resolved
// trust anchor: the algorithm and preferred issuer come from the org's SSO config, so an admin's edit
// takes effect on the next request.
const discoveryMetadataCache = createTtlCache<TOidcDiscoveryMetadata>({
  ttlMs: DISCOVERY_METADATA_TTL_MS,
  maxEntries: MAX_CACHED_PROVIDER_URLS
});

const getDiscoveryMetadata = (documentUrl: string) =>
  discoveryMetadataCache.getOrCreate(documentUrl, () =>
    safeRequest.get<TOidcDiscoveryMetadata>(documentUrl, { timeout: 10_000 }).then(({ data }) => data)
  );

// jwks-rsa caches signing keys per instance, so one client per JWKS URI keeps a fetch off the hot path.
// Entries still expire so the agent's pinned IPs get rebuilt, otherwise a legitimate DNS change at the
// provider would never be picked up for the life of the process.
const jwksClientCache = createTtlCache<JwksClient>({
  ttlMs: JWKS_CLIENT_TTL_MS,
  maxEntries: MAX_CACHED_PROVIDER_URLS
});

const getJwksClient = (jwksUri: string) =>
  jwksClientCache.getOrCreate(jwksUri, async () => {
    const requestAgent = await buildSsrfSafeAgent(jwksUri, { keepAlive: true });

    return new JwksClient({
      jwksUri,
      requestAgent,
      cache: true,
      cacheMaxEntries: 5,
      cacheMaxAge: JWKS_CLIENT_TTL_MS,
      rateLimit: true,
      jwksRequestsPerMinute: 30,
      timeout: 10_000
    });
  });

type TOidcTrustAnchor = {
  issuer: string;
  jwksUri: string;
  algorithm: string;
};

// Reuses the config that governs browser SSO login, so the issuers that can vouch for a user here are
// exactly the ones that can already log them in.
export const resolveOidcTrustAnchor = async (oidcConfig: TOidcConfigs): Promise<TOidcTrustAnchor> => {
  const algorithm = oidcConfig.jwtSignatureAlgorithm || OIDCJWTSignatureAlgorithm.RS256;

  if (!ASYMMETRIC_SIGNATURE_ALGORITHMS.includes(algorithm)) {
    throw new OauthTokenError({
      code: OauthTokenErrorCode.ServerError,
      message: `Token exchange requires an OIDC SSO configuration that uses an asymmetric JWT signature algorithm, but yours uses '${algorithm}'. Switch it to one of ${ASYMMETRIC_SIGNATURE_ALGORITHMS.join(", ")}. ${SSO_TAB_HINT}`
    });
  }

  if (oidcConfig.configurationType === OIDCConfigurationType.DISCOVERY_URL) {
    if (!oidcConfig.discoveryURL) {
      throw new OauthTokenError({
        code: OauthTokenErrorCode.ServerError,
        message: `Your organization's OIDC SSO configuration has no discovery URL, so the identity provider's signing keys cannot be located. ${SSO_TAB_HINT}`
      });
    }

    let metadata: TOidcDiscoveryMetadata;
    try {
      metadata = await getDiscoveryMetadata(buildDiscoveryDocumentUrl(oidcConfig.discoveryURL));
    } catch (error) {
      logger.error(
        { error, orgId: oidcConfig.orgId },
        `OIDC discovery failed during token exchange [orgId=${oidcConfig.orgId}]`
      );
      throw new OauthTokenError({
        code: OauthTokenErrorCode.ServerError,
        message: `Could not reach your organization's identity provider to load its signing keys. ${SSO_TAB_HINT}`
      });
    }

    const jwksUri = metadata.jwks_uri;
    if (!jwksUri) {
      throw new OauthTokenError({
        code: OauthTokenErrorCode.ServerError,
        message: `Your organization's identity provider did not publish a 'jwks_uri' in its discovery document, so subject tokens cannot be verified. ${SSO_TAB_HINT}`
      });
    }

    const issuer = oidcConfig.issuer || metadata.issuer;
    if (!issuer) {
      throw new OauthTokenError({
        code: OauthTokenErrorCode.ServerError,
        message: `Your organization's identity provider did not publish an issuer in its discovery document. ${SSO_TAB_HINT}`
      });
    }

    return { issuer, jwksUri, algorithm };
  }

  if (!oidcConfig.issuer || !oidcConfig.jwksUri) {
    throw new OauthTokenError({
      code: OauthTokenErrorCode.ServerError,
      message: `Your organization's OIDC SSO configuration is missing an issuer or JWKS URI, so subject tokens cannot be verified. ${SSO_TAB_HINT}`
    });
  }

  return { issuer: oidcConfig.issuer, jwksUri: oidcConfig.jwksUri, algorithm };
};

// jose's messages are terse and developer-facing ("unexpected \"aud\" claim value"), so translate them
// into something the caller can act on. Branches key off the error class and `claim` field, never the
// message text, so a wording change upstream can't silently collapse a case into the generic one.
const toSubjectTokenError = (error: unknown, anchor: TOidcTrustAnchor, expectedAudience: string) => {
  if (error instanceof joseErrors.JWTExpired) {
    return new UnauthorizedError({ message: "The subject token has expired." });
  }

  if (error instanceof joseErrors.JWTClaimValidationFailed) {
    if (error.claim === "exp") {
      return new UnauthorizedError({
        message:
          "The subject token has no 'exp' claim, so it never expires and cannot be accepted. Configure your identity provider to set an expiry on tokens it issues for this application."
      });
    }

    if (error.claim === "aud") {
      return new UnauthorizedError({
        message: `The subject token's audience does not match this application's configured token exchange audience ('${expectedAudience}').`
      });
    }

    if (error.claim === "iss") {
      return new UnauthorizedError({
        message: `The subject token was not issued by your organization's configured OIDC SSO issuer ('${anchor.issuer}').`
      });
    }

    if (error.claim === "nbf") {
      return new UnauthorizedError({
        message: "The subject token is not valid yet (its 'nbf' claim is in the future)."
      });
    }
  }

  if (error instanceof joseErrors.JOSEAlgNotAllowed) {
    return new UnauthorizedError({
      message: `The subject token is not signed with the algorithm your organization's OIDC SSO configuration expects ('${anchor.algorithm}').`
    });
  }

  if (error instanceof joseErrors.JOSEError) {
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

export const verifySubjectToken = async ({ subjectToken, oidcConfig, expectedAudience }: TVerifySubjectTokenDTO) => {
  const anchor = await resolveOidcTrustAnchor(oidcConfig);

  let header: ReturnType<typeof decodeProtectedHeader>;
  try {
    header = decodeProtectedHeader(subjectToken);
  } catch {
    throw new UnauthorizedError({ message: "The subject token is not a well-formed JWT." });
  }

  const { kid } = header;
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

    throw new OauthTokenError({
      code: OauthTokenErrorCode.ServerError,
      message: `Could not load signing keys from your organization's identity provider. ${SSO_TAB_HINT}`
    });
  }

  let publicKey;
  try {
    publicKey = await importSPKI(signingKey.getPublicKey(), anchor.algorithm);
  } catch (error) {
    logger.error(
      { error, orgId: oidcConfig.orgId, kid },
      `Subject token signing key could not be imported during token exchange [orgId=${oidcConfig.orgId}] [kid=${kid}]`
    );

    throw new OauthTokenError({
      code: OauthTokenErrorCode.ServerError,
      message: `Your organization's identity provider published a signing key ('${kid}') that cannot be used with the JWT signature algorithm its OIDC SSO configuration declares ('${anchor.algorithm}'). ${SSO_TAB_HINT}`
    });
  }

  let claims: JWTPayload;
  try {
    ({ payload: claims } = await jwtVerify(subjectToken, publicKey, {
      issuer: anchor.issuer,
      audience: expectedAudience,
      algorithms: [anchor.algorithm],
      // 'exp' is optional in RFC 7519 and only checked when present, so without this a token that
      // omits it is exchangeable forever.
      requiredClaims: ["exp"]
    }));
  } catch (error) {
    logger.error(
      { error, orgId: oidcConfig.orgId },
      `Subject token verification failed during token exchange [orgId=${oidcConfig.orgId}]`
    );
    throw toSubjectTokenError(error, anchor, expectedAudience) ?? error;
  }

  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  const authorizedParty = typeof claims.azp === "string" ? claims.azp : undefined;

  if (authorizedParty && authorizedParty !== expectedAudience) {
    throw new UnauthorizedError({
      message: `The subject token was issued to '${authorizedParty}', not to this application's configured token exchange audience ('${expectedAudience}'). Being addressed to this application as an audience is not enough to act on the user's behalf.`
    });
  }

  if (!authorizedParty && audiences.length > 1) {
    throw new UnauthorizedError({
      message: `The subject token is addressed to several audiences (${audiences.join(", ")}) and carries no 'azp' claim, so there is no way to tell it was issued to this application rather than another one. Configure your identity provider to issue tokens addressed only to '${expectedAudience}', or to include an 'azp' claim.`
    });
  }

  if (!claims.sub) {
    throw new UnauthorizedError({
      message: "The subject token has no 'sub' claim, so it does not identify a user."
    });
  }

  return { subject: claims.sub, issuer: anchor.issuer };
};
