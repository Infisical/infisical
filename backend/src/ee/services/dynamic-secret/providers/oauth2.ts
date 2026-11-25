import { isAxiosError } from "axios";
import { z } from "zod";

import { TDynamicSecretUserCredentialServiceFactory } from "@app/ee/services/dynamic-secret-user-credential/dynamic-secret-user-credential-service";
import {
  DynamicSecretExternalUserIdSchema,
  TUserTokenRefreshResult
} from "@app/ee/services/dynamic-secret-user-credential/dynamic-secret-user-credential-types";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto";
import { BadRequestError } from "@app/lib/errors";
import { sanitizeString } from "@app/lib/fn";
import { logger, sanitizeUrlForLog } from "@app/lib/logger";
import { ms } from "@app/lib/ms";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { clientSecretBasicCredentials, formUrlEncode } from "@app/lib/oauth";
import { safeRequest } from "@app/lib/validator";

import {
  DynamicSecretOAuth2Schema,
  OAuth2ClientAuthMethod,
  OAuth2GrantType,
  TDynamicProviderCreateMetadata,
  TDynamicProviderFns,
  TDynamicProviderValidateMetadata
} from "./models";

type TOAuth2ProviderInputs = z.infer<typeof DynamicSecretOAuth2Schema>;

type TIssuedToken = {
  accessToken: string;
  tokenType?: string;
  scope?: string;
  requestedAt: number;
  expiresAt: number | null;
};

const REQUEST_TIMEOUT_MS = 30_000;
// Entra and Google report 3599s for a 1h token, and Entra randomizes lifetimes, so an exact
// comparison would reject TTLs that match what the admin configured on the server.
const TTL_TOLERANCE_MS = 60_000;
const MAX_UPSTREAM_ERROR_LENGTH = 300;
const MIN_LITERAL_IDENTIFIER_REDACTION_LENGTH = 8;

// RFC 6749 calls a dead refresh token invalid_grant; GitHub and Slack use their own codes for the same thing
const DEAD_REFRESH_TOKEN_ERROR_CODES = new Set([
  "invalid_grant",
  "bad_refresh_token",
  "invalid_refresh_token",
  "token_revoked",
  "token_expired"
]);

const OAuth2TokenResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().optional(),
  scope: z.string().optional(),
  expires_in: z.union([z.number(), z.string()]).optional()
});

const OAuth2RefreshResponseSchema = OAuth2TokenResponseSchema.extend({
  refresh_token: z.string().min(1).optional()
});

const OAuth2LeaseDataSchema = z.object({
  ACCESS_TOKEN: z.string().min(1)
});

// RFC 7009 section 2.1 requires the revocation request to authenticate the same way as the token request,
// so both go through here; it adds body parameters in place and returns any headers to send
const applyClientAuth = ({ clientId, clientAuth }: TOAuth2ProviderInputs, body: URLSearchParams) => {
  switch (clientAuth.method) {
    case OAuth2ClientAuthMethod.ClientSecretBasic:
      return {
        Authorization: `Basic ${clientSecretBasicCredentials(clientId, clientAuth.clientSecret)}`
      };
    case OAuth2ClientAuthMethod.ClientSecretPost:
      body.set("client_id", clientId);
      body.set("client_secret", clientAuth.clientSecret);
      return {};
    default: {
      const exhaustiveCheck: never = clientAuth;
      throw new Error(`Unhandled OAuth 2.0 client auth method: ${JSON.stringify(exhaustiveCheck)}`);
    }
  }
};

const getRedactionTargets = ({ clientId, clientAuth }: TOAuth2ProviderInputs, ...tokens: string[]) => ({
  secrets: [clientAuth.clientSecret, ...tokens],
  identifiers: [clientId]
});

const parseJsonBody = (data: unknown): unknown => {
  if (typeof data !== "string") return data;
  try {
    return JSON.parse(data) as unknown;
  } catch {
    return data;
  }
};

const withEncodings = (values: (string | undefined)[]) =>
  values
    .filter((value): value is string => Boolean(value))
    .flatMap((value) => [value, formUrlEncode(value), encodeURIComponent(value)]);

const redact = (
  message: string,
  { secrets, identifiers }: { secrets: (string | undefined)[]; identifiers: (string | undefined)[] }
) => {
  const secretTokens = withEncodings(secrets);
  const identifierTokens = withEncodings(identifiers);

  // a short client ID would match inside ordinary words, so only long identifiers are replaced as substrings
  const literalTokens = [
    ...secretTokens,
    ...identifierTokens.filter((token) => token.length >= MIN_LITERAL_IDENTIFIER_REDACTION_LENGTH)
  ];

  // sanitizeString only matches whole \w+ words, which misses JWTs and secrets containing punctuation
  const literallyRedacted = [...new Set(literalTokens)]
    .sort((a, b) => b.length - a.length)
    .reduce((acc, token) => acc.split(token).join("[REDACTED]"), message);

  return sanitizeString({ unsanitizedString: literallyRedacted, tokens: [...secretTokens, ...identifierTokens] });
};

const readOAuthErrorBody = (body: unknown): { code: string; message: string } | null => {
  if (!body || typeof body !== "object" || !("error" in body) || typeof body.error !== "string") return null;
  const code = body.error.slice(0, MAX_UPSTREAM_ERROR_LENGTH);
  const description =
    "error_description" in body && typeof body.error_description === "string"
      ? body.error_description.slice(0, MAX_UPSTREAM_ERROR_LENGTH)
      : undefined;
  return { code, message: description ? `${code}: ${description}` : code };
};

const describeUpstreamError = (err: unknown): { code?: string; status?: number; message: string } => {
  if (isAxiosError(err) && err.response) {
    const { status } = err.response;
    const oauthError = readOAuthErrorBody(parseJsonBody(err.response.data));
    if (oauthError) return { ...oauthError, status };
    return { status, message: `HTTP ${status}` };
  }
  return { message: (err as Error)?.message || "Unknown error" };
};

const assertSecureUrl = (url: string, fieldLabel: string) => {
  const { protocol } = new URL(url);
  if (protocol === "https:") return;
  if (protocol === "http:" && getConfig().isDevelopmentMode) return;
  throw new BadRequestError({ message: `${fieldLabel} must use https` });
};

export const resolveOAuth2TokenExpiresAt = (
  accessToken: string,
  expiresIn: number | string | undefined,
  requestedAt: number
) => {
  const expiresInSeconds = Number(expiresIn);
  if (expiresIn !== undefined && Number.isFinite(expiresInSeconds) && expiresInSeconds > 0) {
    return requestedAt + expiresInSeconds * 1000;
  }

  try {
    const payload = crypto.jwt().decode(accessToken) as { exp?: unknown } | null;
    if (payload && typeof payload.exp === "number" && Number.isFinite(payload.exp)) {
      return payload.exp * 1000;
    }
  } catch {
    // opaque tokens are not JWTs; their lifetime is unknown
  }

  return null;
};

export const parseOAuth2Inputs = async (inputs: unknown) => {
  const providerInputs = await DynamicSecretOAuth2Schema.parseAsync(inputs);
  assertSecureUrl(providerInputs.tokenUrl, "Token URL");
  assertSecureUrl(providerInputs.revocationUrl, "Revocation URL");
  return providerInputs;
};

export const revokeOAuth2Token = async (
  providerInputs: TOAuth2ProviderInputs,
  token: string,
  tokenTypeHint: "access_token" | "refresh_token" = "access_token"
) => {
  const tokenLabel = tokenTypeHint === "refresh_token" ? "refresh token" : "access token";
  const body = new URLSearchParams({ token, token_type_hint: tokenTypeHint });
  const authHeaders = applyClientAuth(providerInputs, body);

  try {
    await safeRequest.post(providerInputs.revocationUrl, body.toString(), {
      headers: {
        ...authHeaders,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json"
      },
      timeout: REQUEST_TIMEOUT_MS
    });
  } catch (err) {
    const { code, status, message } = describeUpstreamError(err);
    const sanitizedMessage = redact(message, getRedactionTargets(providerInputs, token));
    const revocationUrl = sanitizeUrlForLog(providerInputs.revocationUrl);

    if (code === "unsupported_token_type") {
      throw new BadRequestError({
        message: `The authorization server at ${revocationUrl} doesn't support revoking ${tokenLabel}s (unsupported_token_type). The OAuth 2.0 dynamic secret requires RFC 7009 ${tokenLabel} revocation.`
      });
    }
    if (status === 503) {
      throw new BadRequestError({
        message: `The revocation endpoint at ${revocationUrl} is temporarily unavailable (HTTP 503). Try again later.`
      });
    }
    throw new BadRequestError({
      message: `Failed to revoke the ${tokenLabel} at ${revocationUrl}: ${sanitizedMessage}`
    });
  }
};

export const refreshOAuth2UserToken = async (
  providerInputs: TOAuth2ProviderInputs,
  refreshToken: string
): Promise<TUserTokenRefreshResult> => {
  const body = new URLSearchParams();
  providerInputs.extraParams.forEach(({ key, value }) => body.set(key, value));
  body.set("grant_type", "refresh_token");
  body.set("refresh_token", refreshToken);
  if (providerInputs.scope) body.set("scope", providerInputs.scope);
  const authHeaders = applyClientAuth(providerInputs, body);
  const tokenUrl = sanitizeUrlForLog(providerInputs.tokenUrl);
  const redactionTargets = getRedactionTargets(providerInputs, refreshToken);

  const rejectedOrThrow = ({ code, message }: { code?: string; message: string }): TUserTokenRefreshResult => {
    const sanitizedMessage = redact(message, redactionTargets);
    if (code && DEAD_REFRESH_TOKEN_ERROR_CODES.has(code)) {
      return {
        status: "rejected",
        reason: `The authorization server at ${tokenUrl} rejected the stored refresh token (${sanitizedMessage}).`
      };
    }
    throw new BadRequestError({
      message: `The authorization server at ${tokenUrl} rejected the token refresh: ${sanitizedMessage}`
    });
  };

  // measured before sending so a slow response can't make the token look longer-lived than it is
  const requestedAt = Date.now();

  let responseData: unknown;
  try {
    const response = await safeRequest.post<unknown>(providerInputs.tokenUrl, body.toString(), {
      headers: {
        ...authHeaders,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json"
      },
      timeout: REQUEST_TIMEOUT_MS,
      // a retried refresh can rotate the refresh token in a response we never read, which loses the user's login
      "axios-retry": { retries: 0 }
    });
    responseData = parseJsonBody(response.data);
  } catch (err) {
    return rejectedOrThrow(describeUpstreamError(err));
  }

  // GitHub reports token errors with HTTP 200
  const oauthError = readOAuthErrorBody(responseData);
  if (oauthError) return rejectedOrThrow(oauthError);

  const parsed = OAuth2RefreshResponseSchema.safeParse(responseData);
  if (!parsed.success) {
    throw new BadRequestError({
      message: `The authorization server at ${tokenUrl} returned a refresh response without an access_token. Check that the token URL points to an OAuth 2.0 token endpoint.`
    });
  }

  const {
    access_token: accessToken,
    refresh_token: newRefreshToken,
    token_type: tokenType,
    scope,
    expires_in: expiresIn
  } = parsed.data;

  return {
    status: "refreshed",
    accessToken,
    refreshToken: newRefreshToken,
    tokenType,
    scope,
    requestedAt,
    expiresAt: resolveOAuth2TokenExpiresAt(accessToken, expiresIn, requestedAt)
  };
};

type TOAuth2ProviderDTO = {
  dynamicSecretUserCredentialService: Pick<TDynamicSecretUserCredentialServiceFactory, "issueAccessToken">;
};

export const OAuth2Provider = ({ dynamicSecretUserCredentialService }: TOAuth2ProviderDTO): TDynamicProviderFns => {
  const validateProviderInputs = async (
    inputs: object,
    { previousInputs, hasActiveLeases, hasUserCredentials }: TDynamicProviderValidateMetadata
  ) => {
    const providerInputs = await parseOAuth2Inputs(inputs);

    if (!hasActiveLeases && !hasUserCredentials) return providerInputs;

    const previous = previousInputs as { tokenUrl?: unknown; clientId?: unknown; grantType?: unknown } | undefined;
    const issuedTokensLabel = [hasActiveLeases && "active leases", hasUserCredentials && "stored user tokens"]
      .filter(Boolean)
      .join(" and ");
    const revokeFirstStep = `${[
      hasActiveLeases && "Revoke the active leases",
      hasUserCredentials && (hasActiveLeases ? "delete the stored user tokens" : "Delete the stored user tokens")
    ]
      .filter(Boolean)
      .join(" and ")} first`;

    if (typeof previous?.grantType === "string" && previous.grantType !== providerInputs.grantType) {
      throw new BadRequestError({
        message: `The grant type can't be changed while this dynamic secret has ${issuedTokensLabel}, because they were issued under the current grant type. ${revokeFirstStep}, then change the grant type.`
      });
    }

    if (typeof previous?.tokenUrl === "string" && previous.tokenUrl !== providerInputs.tokenUrl) {
      throw new BadRequestError({
        message: `The token URL can't be changed while this dynamic secret has ${issuedTokensLabel}, because their tokens were issued by the current authorization server. ${revokeFirstStep}, then change the token URL.`
      });
    }

    // RFC 7009 section 2.1: a server only lets the client that was issued a token revoke it
    if (typeof previous?.clientId === "string" && previous.clientId !== providerInputs.clientId) {
      throw new BadRequestError({
        message: `The client ID can't be changed while this dynamic secret has ${issuedTokensLabel}, because only the client that issued their tokens can revoke or refresh them. ${revokeFirstStep}, then change the client ID.`
      });
    }

    return providerInputs;
  };

  const $requestToken = async (providerInputs: TOAuth2ProviderInputs): Promise<TIssuedToken> => {
    const body = new URLSearchParams({ grant_type: "client_credentials" });
    if (providerInputs.scope) body.set("scope", providerInputs.scope);
    providerInputs.extraParams.forEach(({ key, value }) => body.set(key, value));
    const authHeaders = applyClientAuth(providerInputs, body);

    // measured before sending so a slow response can't make the token look longer-lived than it is
    const requestedAt = Date.now();

    let responseData: unknown;
    try {
      const response = await safeRequest.post<unknown>(providerInputs.tokenUrl, body.toString(), {
        headers: {
          ...authHeaders,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json"
        },
        timeout: REQUEST_TIMEOUT_MS,
        // a retried token request can mint a token whose response we never see, and so never revoke
        "axios-retry": { retries: 0 }
      });
      responseData = response.data;
    } catch (err) {
      const { message } = describeUpstreamError(err);
      throw new BadRequestError({
        message: `The authorization server at ${sanitizeUrlForLog(providerInputs.tokenUrl)} rejected the token request: ${redact(message, getRedactionTargets(providerInputs))}`
      });
    }

    const parsed = OAuth2TokenResponseSchema.safeParse(parseJsonBody(responseData));
    if (!parsed.success) {
      throw new BadRequestError({
        message: `The authorization server at ${sanitizeUrlForLog(providerInputs.tokenUrl)} returned a token response without an access_token. Check that the token URL points to an OAuth 2.0 token endpoint.`
      });
    }

    const { access_token: accessToken, token_type: tokenType, scope, expires_in: expiresIn } = parsed.data;

    return {
      accessToken,
      tokenType,
      scope,
      requestedAt,
      expiresAt: resolveOAuth2TokenExpiresAt(accessToken, expiresIn, requestedAt)
    };
  };

  const $assertLeaseWithinTokenLifetime = (token: TIssuedToken, leaseEndsAt: number, ttlLabel: string) => {
    if (token.expiresAt === null) return;
    if (leaseEndsAt <= token.expiresAt + TTL_TOLERANCE_MS) return;

    const ttlSeconds = Math.ceil((leaseEndsAt - token.requestedAt) / 1000);
    const lifetimeSeconds = Math.max(Math.floor((token.expiresAt - token.requestedAt) / 1000), 0);
    throw new BadRequestError({
      message: `The ${ttlLabel} (${ttlSeconds}s) is longer than the lifetime of the access tokens the authorization server issues (${lifetimeSeconds}s). Set the ${ttlLabel} to ${lifetimeSeconds}s or less.`
    });
  };

  const $revokeBestEffort = async (providerInputs: TOAuth2ProviderInputs, accessToken: string, reason: string) => {
    try {
      await revokeOAuth2Token(providerInputs, accessToken);
    } catch (err) {
      logger.warn(
        `OAuth 2.0 dynamic secret: failed to revoke token after ${reason} [revocationUrl=${sanitizeUrlForLog(providerInputs.revocationUrl)}]: ${(err as Error)?.message}`
      );
    }
  };

  const validateConnection = async (
    inputs: unknown,
    { defaultTTL, maxTTL }: { projectId: string; defaultTTL?: string; maxTTL?: string | null }
  ) => {
    const providerInputs = await parseOAuth2Inputs(inputs);

    // tokens for a user only exist after that user authorizes, so there is nothing to request yet
    if (providerInputs.grantType === OAuth2GrantType.AuthorizationCode) return true;

    const token = await $requestToken(providerInputs);

    try {
      if (defaultTTL) $assertLeaseWithinTokenLifetime(token, token.requestedAt + ms(defaultTTL), "default TTL");
      if (maxTTL) $assertLeaseWithinTokenLifetime(token, token.requestedAt + ms(maxTTL), "max TTL");
    } catch (err) {
      await $revokeBestEffort(providerInputs, token.accessToken, "rejecting the configuration");
      throw err;
    }

    try {
      await revokeOAuth2Token(providerInputs, token.accessToken);
    } catch (err) {
      throw new BadRequestError({
        message: `Infisical got a test token from the authorization server but couldn't revoke it, so it couldn't revoke lease tokens either. ${(err as Error)?.message}`
      });
    }

    return true;
  };

  const toLeaseData = (token: TIssuedToken) => ({
    ACCESS_TOKEN: token.accessToken,
    ...(token.tokenType ? { TOKEN_TYPE: token.tokenType } : {}),
    ...(token.expiresAt !== null ? { EXPIRES_AT: new Date(token.expiresAt).toISOString() } : {}),
    ...(token.scope ? { SCOPE: token.scope } : {})
  });

  const $createUserLease = async ({
    providerInputs,
    expireAt,
    dynamicSecret,
    metadata,
    externalUserId
  }: {
    providerInputs: TOAuth2ProviderInputs;
    expireAt: number;
    dynamicSecret: Parameters<TDynamicProviderFns["create"]>[0]["dynamicSecret"];
    metadata: TDynamicProviderCreateMetadata;
    externalUserId: unknown;
  }) => {
    const parsedExternalUserId = DynamicSecretExternalUserIdSchema.safeParse(externalUserId);
    if (!parsedExternalUserId.success) {
      throw new BadRequestError({
        message:
          externalUserId === undefined
            ? "This dynamic secret issues access tokens for your application's users. Pass the user's ID as config.externalUserId when creating a lease."
            : `Invalid config.externalUserId: ${parsedExternalUserId.error.issues[0]?.message}`
      });
    }

    const token = await dynamicSecretUserCredentialService.issueAccessToken({
      dynamicSecret,
      projectId: metadata.projectId,
      externalUserId: parsedExternalUserId.data,
      leaseEndsAt: expireAt,
      refresh: (refreshToken) => refreshOAuth2UserToken(providerInputs, refreshToken)
    });

    $assertLeaseWithinTokenLifetime(token, expireAt, "lease TTL");

    return { entityId: alphaNumericNanoId(32), data: toLeaseData(token) };
  };

  const create: TDynamicProviderFns["create"] = async ({ inputs, expireAt, dynamicSecret, metadata, config }) => {
    const providerInputs = await parseOAuth2Inputs(inputs);

    if (providerInputs.grantType === OAuth2GrantType.AuthorizationCode) {
      return $createUserLease({
        providerInputs,
        expireAt,
        dynamicSecret,
        metadata,
        externalUserId: config?.externalUserId
      });
    }

    const token = await $requestToken(providerInputs);

    try {
      $assertLeaseWithinTokenLifetime(token, expireAt, "lease TTL");
    } catch (err) {
      await $revokeBestEffort(providerInputs, token.accessToken, "rejecting the lease TTL");
      throw err;
    }

    return { entityId: alphaNumericNanoId(32), data: toLeaseData(token) };
  };

  const revoke = async (inputs: unknown, entityId: string, metadata: { leaseData?: Record<string, string> }) => {
    const providerInputs = await parseOAuth2Inputs(inputs);

    // Leases for the same user can hand out the same access token, so revoking it for one lease would break the
    // others. The user's tokens are revoked when the application deletes them.
    if (providerInputs.grantType === OAuth2GrantType.AuthorizationCode) return { entityId };

    const leaseData = OAuth2LeaseDataSchema.safeParse(metadata.leaseData);
    if (!leaseData.success) {
      throw new BadRequestError({
        message:
          "This lease has no stored access token, so Infisical can't revoke it. Force delete the lease to remove it; the token stays valid until it expires."
      });
    }

    await revokeOAuth2Token(providerInputs, leaseData.data.ACCESS_TOKEN);
    return { entityId };
  };

  const renew = async (): Promise<{ entityId: string }> => {
    throw new BadRequestError({
      message: "OAuth 2.0 access tokens can't be extended. Create a new lease to get a new token."
    });
  };

  return {
    persistedLeaseFields: ["ACCESS_TOKEN"],
    validateProviderInputs,
    validateConnection,
    create,
    revoke,
    renew
  };
};
