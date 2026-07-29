import { AxiosError } from "axios";

import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { safeRequest } from "@app/lib/validator";
import {
  getCloudflareAuthHeaders,
  getCloudflareErrorMessage
} from "@app/services/app-connection/cloudflare/cloudflare-connection-fns";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";

import { CLOUDFLARE_TOKEN_MIN_TTL_DAYS } from "./cloudflare-token-rotation-constants";
import {
  TCloudflareCreateTokenResponse,
  TCloudflareTokenCondition,
  TCloudflareTokenCredentials,
  TCloudflareTokenPolicyInput,
  TCloudflareTokenRestrictions,
  TCloudflareVerifyTokenResponse
} from "./cloudflare-token-rotation-types";

export const getCloudflareTokenExpiresOn = (rotationInterval: number) => {
  const days = Math.max(rotationInterval * 2 + 1, CLOUDFLARE_TOKEN_MIN_TTL_DAYS);

  const expiresOn = new Date();
  expiresOn.setUTCDate(expiresOn.getUTCDate() + days);
  expiresOn.setUTCMilliseconds(0);

  // Cloudflare expects RFC 3339 without fractional seconds
  return expiresOn.toISOString().replace(/\.\d{3}Z$/, "Z");
};

// an empty `in` list would deny every request, so we omit either side rather than sending []
export const buildCloudflareTokenCondition = ({
  allowedIps,
  disallowedIps
}: TCloudflareTokenRestrictions): TCloudflareTokenCondition | undefined => {
  if (!allowedIps?.length && !disallowedIps?.length) return undefined;

  return {
    "request.ip": {
      ...(allowedIps?.length ? { in: allowedIps } : {}),
      ...(disallowedIps?.length ? { not_in: disallowedIps } : {})
    }
  };
};

export const createCloudflareToken = async ({
  accountId,
  connectionApiToken,
  name,
  policies,
  rotationInterval,
  allowedIps,
  disallowedIps
}: {
  accountId: string;
  /** the app connection's token, which is what authorizes the create call */
  connectionApiToken: string;
  /** the user-supplied base name; a timestamp is appended so each rotated token is distinct */
  name: string;
  policies: TCloudflareTokenPolicyInput[];
  rotationInterval: number;
} & TCloudflareTokenRestrictions): Promise<TCloudflareTokenCredentials> => {
  try {
    const { data } = await safeRequest.post<TCloudflareCreateTokenResponse>(
      `${IntegrationUrls.CLOUDFLARE_API_URL}/client/v4/accounts/${accountId}/tokens`,
      {
        name: `${name}-${Date.now()}`,
        policies: policies.map((policy) => ({
          effect: policy.effect,
          resources: policy.resources,
          permission_groups: policy.permissionGroupIds.map((id) => ({ id }))
        })),
        expires_on: getCloudflareTokenExpiresOn(rotationInterval),
        condition: buildCloudflareTokenCondition({ allowedIps, disallowedIps })
      },
      {
        headers: {
          ...getCloudflareAuthHeaders(connectionApiToken),
          "Content-Type": "application/json"
        }
      }
    );

    if (!data?.result?.id || !data?.result?.value) {
      throw new BadRequestError({
        message: "Cloudflare API token response missing 'result.id' or 'result.value'"
      });
    }

    return { tokenId: data.result.id, tokenValue: data.result.value };
  } catch (error: unknown) {
    if (error instanceof BadRequestError) throw error;

    throw new BadRequestError({
      message: `Failed to create Cloudflare API token: ${getCloudflareErrorMessage(error)}`
    });
  }
};

export const deleteCloudflareToken = async ({
  accountId,
  connectionApiToken,
  tokenId
}: {
  accountId: string;
  connectionApiToken: string;
  tokenId: string;
}) => {
  try {
    await safeRequest.delete(
      `${IntegrationUrls.CLOUDFLARE_API_URL}/client/v4/accounts/${accountId}/tokens/${encodeURIComponent(tokenId)}`,
      { headers: getCloudflareAuthHeaders(connectionApiToken) }
    );
  } catch (error: unknown) {
    // 404 means the token is already gone, which is the desired end state of revocation
    if (error instanceof AxiosError && error.response?.status === 404) return;

    throw new BadRequestError({
      message: `Failed to delete Cloudflare API token ${tokenId}: ${getCloudflareErrorMessage(error)}`
    });
  }
};

/**
 * Best-effort revocation of every listed token. Used by the cleanup paths, where a failure must not
 * abort the remaining deletions, so each one is logged rather than thrown.
 */
export const revokeCloudflareTokens = async ({
  accountId,
  connectionApiToken,
  tokenIds,
  logPrefix
}: {
  accountId: string;
  connectionApiToken: string;
  tokenIds: string[];
  /** identifies the caller in the log line, e.g. `cloudflareApiTokenRotation: ... [rotationId=...]` */
  logPrefix: string;
}) => {
  const results = await Promise.allSettled(
    tokenIds.map((tokenId) => deleteCloudflareToken({ accountId, connectionApiToken, tokenId }))
  );

  results.forEach((result, index) => {
    if (result.status === "rejected") {
      logger.error(result.reason, `${logPrefix} [tokenId=${tokenIds[index]}]`);
    }
  });
};

/**
 * Verifies a generated token by introspecting it with itself as the bearer — the connection's token
 * cannot tell us whether the generated one is still active.
 */
export const verifyCloudflareToken = async ({ accountId, tokenValue }: { accountId: string; tokenValue: string }) => {
  try {
    const { data } = await safeRequest.get<TCloudflareVerifyTokenResponse>(
      `${IntegrationUrls.CLOUDFLARE_API_URL}/client/v4/accounts/${accountId}/tokens/verify`,
      { headers: getCloudflareAuthHeaders(tokenValue) }
    );

    if (!data.success || data.result?.status !== "active") {
      throw new BadRequestError({
        message: `Cloudflare API token verification failed: token status is ${data.result?.status ?? "unknown"}`
      });
    }
  } catch (error: unknown) {
    if (error instanceof BadRequestError) throw error;

    throw new BadRequestError({
      message: `Cloudflare API token verification failed: ${getCloudflareErrorMessage(error)}`
    });
  }
};
