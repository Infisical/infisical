import { isAxiosError } from "axios";
import { z } from "zod";

import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto";
import { BadRequestError } from "@app/lib/errors";
import { sanitizeString } from "@app/lib/fn";
import { logger, sanitizeUrlForLog } from "@app/lib/logger";
import { ms } from "@app/lib/ms";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { safeRequest } from "@app/lib/validator";

import {
  DynamicSecretOAuthSchema,
  OAuthClientAuthMethod,
  TDynamicProviderFns,
  TDynamicProviderValidateMetadata
} from "./models";

type TOAuthProviderInputs = z.infer<typeof DynamicSecretOAuthSchema>;

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
const MIN_LITERAL_REDACTION_LENGTH = 8;

const OAuthTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().optional(),
  scope: z.string().optional(),
  expires_in: z.union([z.number(), z.string()]).optional()
});

const OAuthLeaseDataSchema = z.object({
  ACCESS_TOKEN: z.string().min(1)
});

// RFC 6749 section 2.3.1: credentials are form-urlencoded before being joined and base64 encoded
const formEncode = (value: string) => new URLSearchParams([["", value]]).toString().slice(1);

// RFC 7009 section 2.1 requires the revocation request to authenticate the same way as the token request,
// so both go through here; it adds body parameters in place and returns any headers to send
const applyClientAuth = ({ clientId, clientAuth }: TOAuthProviderInputs, body: URLSearchParams) => {
  switch (clientAuth.method) {
    case OAuthClientAuthMethod.ClientSecretBasic:
      return {
        Authorization: `Basic ${Buffer.from(`${formEncode(clientId)}:${formEncode(clientAuth.clientSecret)}`).toString("base64")}`
      };
    case OAuthClientAuthMethod.ClientSecretPost:
      body.set("client_id", clientId);
      body.set("client_secret", clientAuth.clientSecret);
      return {};
    default: {
      const exhaustiveCheck: never = clientAuth;
      throw new Error(`Unhandled OAuth client auth method: ${JSON.stringify(exhaustiveCheck)}`);
    }
  }
};

const getClientCredentialSecrets = ({ clientId, clientAuth }: TOAuthProviderInputs) => [
  clientId,
  clientAuth.clientSecret
];

const parseJsonBody = (data: unknown): unknown => {
  if (typeof data !== "string") return data;
  try {
    return JSON.parse(data) as unknown;
  } catch {
    return data;
  }
};

const redact = (message: string, secrets: (string | undefined)[]) => {
  const tokens = secrets
    .filter((secret): secret is string => Boolean(secret))
    .flatMap((secret) => [secret, formEncode(secret), encodeURIComponent(secret)]);

  // sanitizeString only matches whole \w+ words, which misses JWTs and secrets containing punctuation
  const literallyRedacted = [...new Set(tokens)]
    .filter((token) => token.length >= MIN_LITERAL_REDACTION_LENGTH)
    .sort((a, b) => b.length - a.length)
    .reduce((acc, token) => acc.split(token).join("[REDACTED]"), message);

  return sanitizeString({ unsanitizedString: literallyRedacted, tokens });
};

const describeUpstreamError = (err: unknown): { code?: string; status?: number; message: string } => {
  if (isAxiosError(err) && err.response) {
    const { status } = err.response;
    const body = parseJsonBody(err.response.data);
    if (body && typeof body === "object" && "error" in body && typeof body.error === "string") {
      const code = body.error.slice(0, MAX_UPSTREAM_ERROR_LENGTH);
      const description =
        "error_description" in body && typeof body.error_description === "string"
          ? body.error_description.slice(0, MAX_UPSTREAM_ERROR_LENGTH)
          : undefined;
      return { code, status, message: description ? `${code}: ${description}` : code };
    }
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

const resolveExpiresAt = (accessToken: string, expiresIn: number | string | undefined, requestedAt: number) => {
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

export const OAuthProvider = (): TDynamicProviderFns => {
  const $parseInputs = async (inputs: unknown) => {
    const providerInputs = await DynamicSecretOAuthSchema.parseAsync(inputs);
    assertSecureUrl(providerInputs.tokenUrl, "Token URL");
    assertSecureUrl(providerInputs.revocationUrl, "Revocation URL");
    return providerInputs;
  };

  const validateProviderInputs = async (
    inputs: object,
    { previousInputs, hasActiveLeases }: TDynamicProviderValidateMetadata
  ) => {
    const providerInputs = await $parseInputs(inputs);

    if (!hasActiveLeases) return providerInputs;

    const previous = previousInputs as { tokenUrl?: unknown; clientId?: unknown } | undefined;
    if (typeof previous?.tokenUrl === "string" && previous.tokenUrl !== providerInputs.tokenUrl) {
      throw new BadRequestError({
        message:
          "The token URL can't be changed while this dynamic secret has active leases, because their tokens were issued by the current authorization server. Revoke the active leases first, then change the token URL."
      });
    }

    // RFC 7009 section 2.1: a server only lets the client that was issued a token revoke it
    if (typeof previous?.clientId === "string" && previous.clientId !== providerInputs.clientId) {
      throw new BadRequestError({
        message:
          "The client ID can't be changed while this dynamic secret has active leases, because only the client that issued their tokens can revoke them. Revoke the active leases first, then change the client ID."
      });
    }

    return providerInputs;
  };

  const $requestToken = async (providerInputs: TOAuthProviderInputs): Promise<TIssuedToken> => {
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
        message: `The authorization server at ${sanitizeUrlForLog(providerInputs.tokenUrl)} rejected the token request: ${redact(message, getClientCredentialSecrets(providerInputs))}`
      });
    }

    const parsed = OAuthTokenResponseSchema.safeParse(parseJsonBody(responseData));
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
      expiresAt: resolveExpiresAt(accessToken, expiresIn, requestedAt)
    };
  };

  const $revokeToken = async (providerInputs: TOAuthProviderInputs, accessToken: string) => {
    const body = new URLSearchParams({ token: accessToken, token_type_hint: "access_token" });
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
      const sanitizedMessage = redact(message, [...getClientCredentialSecrets(providerInputs), accessToken]);
      const revocationUrl = sanitizeUrlForLog(providerInputs.revocationUrl);

      if (code === "unsupported_token_type") {
        throw new BadRequestError({
          message: `The authorization server at ${revocationUrl} doesn't support revoking access tokens (unsupported_token_type). The OAuth dynamic secret requires RFC 7009 access token revocation.`
        });
      }
      if (status === 503) {
        throw new BadRequestError({
          message: `The revocation endpoint at ${revocationUrl} is temporarily unavailable (HTTP 503). Try again later.`
        });
      }
      throw new BadRequestError({
        message: `Failed to revoke the access token at ${revocationUrl}: ${sanitizedMessage}`
      });
    }
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

  const $revokeBestEffort = async (providerInputs: TOAuthProviderInputs, accessToken: string, reason: string) => {
    try {
      await $revokeToken(providerInputs, accessToken);
    } catch (err) {
      logger.warn(
        `OAuth dynamic secret: failed to revoke token after ${reason} [revocationUrl=${sanitizeUrlForLog(providerInputs.revocationUrl)}]: ${(err as Error)?.message}`
      );
    }
  };

  const validateConnection = async (
    inputs: unknown,
    { defaultTTL, maxTTL }: { projectId: string; defaultTTL?: string; maxTTL?: string | null }
  ) => {
    const providerInputs = await $parseInputs(inputs);
    const token = await $requestToken(providerInputs);

    try {
      if (defaultTTL) $assertLeaseWithinTokenLifetime(token, token.requestedAt + ms(defaultTTL), "default TTL");
      if (maxTTL) $assertLeaseWithinTokenLifetime(token, token.requestedAt + ms(maxTTL), "max TTL");
    } catch (err) {
      await $revokeBestEffort(providerInputs, token.accessToken, "rejecting the configuration");
      throw err;
    }

    try {
      await $revokeToken(providerInputs, token.accessToken);
    } catch (err) {
      throw new BadRequestError({
        message: `Infisical got a test token from the authorization server but couldn't revoke it, so it couldn't revoke lease tokens either. ${(err as Error)?.message}`
      });
    }

    return true;
  };

  const create = async ({ inputs, expireAt }: { inputs: unknown; expireAt: number }) => {
    const providerInputs = await $parseInputs(inputs);
    const token = await $requestToken(providerInputs);

    try {
      $assertLeaseWithinTokenLifetime(token, expireAt, "lease TTL");
    } catch (err) {
      await $revokeBestEffort(providerInputs, token.accessToken, "rejecting the lease TTL");
      throw err;
    }

    return {
      entityId: alphaNumericNanoId(32),
      data: {
        ACCESS_TOKEN: token.accessToken,
        ...(token.tokenType ? { TOKEN_TYPE: token.tokenType } : {}),
        ...(token.expiresAt !== null ? { EXPIRES_AT: new Date(token.expiresAt).toISOString() } : {}),
        ...(token.scope ? { SCOPE: token.scope } : {})
      }
    };
  };

  const revoke = async (inputs: unknown, entityId: string, metadata: { leaseData?: Record<string, string> }) => {
    const providerInputs = await $parseInputs(inputs);

    const leaseData = OAuthLeaseDataSchema.safeParse(metadata.leaseData);
    if (!leaseData.success) {
      throw new BadRequestError({
        message:
          "This lease has no stored access token, so Infisical can't revoke it. Force delete the lease to remove it; the token stays valid until it expires."
      });
    }

    await $revokeToken(providerInputs, leaseData.data.ACCESS_TOKEN);
    return { entityId };
  };

  const renew = async (): Promise<{ entityId: string }> => {
    throw new BadRequestError({
      message: "OAuth access tokens can't be extended. Create a new lease to get a new token."
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
