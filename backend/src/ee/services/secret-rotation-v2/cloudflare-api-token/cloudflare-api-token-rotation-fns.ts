import { AxiosError } from "axios";

import {
  TRotationFactory,
  TRotationFactoryCheckActiveCredentials,
  TRotationFactoryGetSecretsPayload,
  TRotationFactoryIssueCredentials,
  TRotationFactoryRevokeCredentials,
  TRotationFactoryRotateCredentials
} from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { safeRequest } from "@app/lib/validator";
import {
  getCloudflareAuthHeaders,
  getCloudflareErrorMessage
} from "@app/services/app-connection/cloudflare/cloudflare-connection-fns";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";

import { CLOUDFLARE_API_TOKEN_MIN_TTL_DAYS } from "./cloudflare-api-token-rotation-constants";
import { CloudflareApiTokenPolicyScope } from "./cloudflare-api-token-rotation-schemas";
import {
  TCloudflareApiTokenPolicy,
  TCloudflareApiTokenRotationGeneratedCredentials,
  TCloudflareApiTokenRotationWithConnection,
  TCloudflareCreateTokenResponse,
  TCloudflareVerifyTokenResponse
} from "./cloudflare-api-token-rotation-types";

export const cloudflareApiTokenRotationFactory: TRotationFactory<
  TCloudflareApiTokenRotationWithConnection,
  TCloudflareApiTokenRotationGeneratedCredentials
> = (secretRotation) => {
  const {
    id: rotationId,
    connection,
    rotationInterval,
    parameters: { name, policies, allowedIps, disallowedIps },
    secretsMapping
  } = secretRotation;

  const { accountId, apiToken } = connection.credentials;

  const authHeaders = getCloudflareAuthHeaders(apiToken);

  // https://developers.cloudflare.com/fundamentals/api/how-to/create-via-api/ — note that all-zones is
  // expressed as a nested object rather than the "*" string the other scopes use
  const $buildResources = (policy: TCloudflareApiTokenPolicy): Record<string, string | Record<string, string>> => {
    if (policy.scope === CloudflareApiTokenPolicyScope.Account) {
      return { [`com.cloudflare.api.account.${accountId}`]: "*" };
    }

    if (policy.scope === CloudflareApiTokenPolicyScope.AllZones) {
      return { [`com.cloudflare.api.account.${accountId}`]: { "com.cloudflare.api.account.zone.*": "*" } };
    }

    return Object.fromEntries(
      (policy.zoneIds ?? []).map((zoneId) => [`com.cloudflare.api.account.zone.${zoneId}`, "*"])
    );
  };

  // an empty `in` list would deny every request, so we omit either side rather than sending []
  const $buildCondition = () => {
    if (!allowedIps?.length && !disallowedIps?.length) return undefined;

    return {
      "request.ip": {
        ...(allowedIps?.length ? { in: allowedIps } : {}),
        ...(disallowedIps?.length ? { not_in: disallowedIps } : {})
      }
    };
  };

  const $getExpiresOn = () => {
    const days = Math.max(rotationInterval * 2 + 1, CLOUDFLARE_API_TOKEN_MIN_TTL_DAYS);

    const expiresOn = new Date();
    expiresOn.setUTCDate(expiresOn.getUTCDate() + days);
    expiresOn.setUTCMilliseconds(0);

    // Cloudflare expects RFC 3339 without fractional seconds
    return expiresOn.toISOString().replace(/\.\d{3}Z$/, "Z");
  };

  const $createToken = async () => {
    try {
      const { data } = await safeRequest.post<TCloudflareCreateTokenResponse>(
        `${IntegrationUrls.CLOUDFLARE_API_URL}/client/v4/accounts/${accountId}/tokens`,
        {
          name: `${name}-${Date.now()}`,
          policies: policies.map((policy) => ({
            effect: policy.effect,
            resources: $buildResources(policy),
            permission_groups: policy.permissionGroupIds.map((id) => ({ id }))
          })),
          expires_on: $getExpiresOn(),
          condition: $buildCondition()
        },
        {
          headers: {
            ...authHeaders,
            "Content-Type": "application/json"
          }
        }
      );

      if (!data?.result?.id || !data?.result?.value) {
        throw new BadRequestError({
          message: "Cloudflare API token response missing 'result.id' or 'result.value'"
        });
      }

      return { tokenId: data.result.id, apiToken: data.result.value };
    } catch (error: unknown) {
      if (error instanceof BadRequestError) throw error;

      throw new BadRequestError({
        message: `Failed to create Cloudflare API token: ${getCloudflareErrorMessage(error)}`
      });
    }
  };

  const $deleteToken = async (tokenId: string) => {
    try {
      await safeRequest.delete(
        `${IntegrationUrls.CLOUDFLARE_API_URL}/client/v4/accounts/${accountId}/tokens/${encodeURIComponent(tokenId)}`,
        { headers: authHeaders }
      );
    } catch (error: unknown) {
      // 404 means the token is already gone, which is the desired end state of revocation
      if (error instanceof AxiosError && error.response?.status === 404) return;

      throw new BadRequestError({
        message: `Failed to delete Cloudflare API token ${tokenId}: ${getCloudflareErrorMessage(error)}`
      });
    }
  };

  const issueCredentials: TRotationFactoryIssueCredentials<TCloudflareApiTokenRotationGeneratedCredentials> = async (
    callback
  ) => {
    const credentials = await $createToken();

    return callback(credentials);
  };

  const revokeCredentials: TRotationFactoryRevokeCredentials<TCloudflareApiTokenRotationGeneratedCredentials> = async (
    generatedCredentials,
    callback
  ) => {
    if (!generatedCredentials?.length) return callback();

    const results = await Promise.allSettled(
      generatedCredentials.map((credential) => $deleteToken(credential.tokenId))
    );

    results.forEach((result, index) => {
      if (result.status === "rejected") {
        logger.error(
          result.reason,
          `cloudflareApiTokenRotation: failed to revoke token during cleanup [rotationId=${rotationId}] [tokenId=${generatedCredentials[index].tokenId}]`
        );
      }
    });

    return callback();
  };

  // We persist the new token before revoking the old one so a revocation failure can never leave the
  // rotation without a usable credential.
  const rotateCredentials: TRotationFactoryRotateCredentials<TCloudflareApiTokenRotationGeneratedCredentials> = async (
    credentialsToRevoke,
    callback
  ) => {
    const newCredentials = await $createToken();

    const result = await callback(newCredentials);

    if (credentialsToRevoke?.tokenId) {
      try {
        await $deleteToken(credentialsToRevoke.tokenId);
      } catch (error) {
        logger.error(
          error,
          `cloudflareApiTokenRotation: failed to revoke previous token after rotation [rotationId=${rotationId}] [tokenId=${credentialsToRevoke.tokenId}]`
        );
      }
    }

    return result;
  };

  const getSecretsPayload: TRotationFactoryGetSecretsPayload<TCloudflareApiTokenRotationGeneratedCredentials> = (
    generatedCredentials
  ) => [
    { key: secretsMapping.tokenId, value: generatedCredentials.tokenId },
    { key: secretsMapping.apiToken, value: generatedCredentials.apiToken }
  ];

  const checkActiveCredentials: TRotationFactoryCheckActiveCredentials<
    TCloudflareApiTokenRotationGeneratedCredentials
  > = async (activeCredentials) => {
    try {
      const { data } = await safeRequest.get<TCloudflareVerifyTokenResponse>(
        `${IntegrationUrls.CLOUDFLARE_API_URL}/client/v4/accounts/${accountId}/tokens/verify`,
        { headers: getCloudflareAuthHeaders(activeCredentials.apiToken) }
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

  return {
    issueCredentials,
    revokeCredentials,
    rotateCredentials,
    getSecretsPayload,
    checkActiveCredentials
  };
};
