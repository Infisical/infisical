import {
  TRotationFactory,
  TRotationFactoryCheckActiveCredentials,
  TRotationFactoryGetSecretsPayload,
  TRotationFactoryIssueCredentials,
  TRotationFactoryRevokeCredentials,
  TRotationFactoryRotateCredentials
} from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";
import {
  createCloudflareToken,
  deleteCloudflareToken,
  revokeCloudflareTokens,
  TCloudflareTokenResources,
  verifyCloudflareToken
} from "@app/ee/services/secret-rotation-v2/shared/cloudflare-token";
import { logger } from "@app/lib/logger";

import { CloudflareApiTokenPolicyScope } from "./cloudflare-api-token-rotation-schemas";
import {
  TCloudflareApiTokenPolicy,
  TCloudflareApiTokenRotationGeneratedCredentials,
  TCloudflareApiTokenRotationWithConnection
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

  const { accountId, apiToken: connectionApiToken } = connection.credentials;

  // https://developers.cloudflare.com/fundamentals/api/how-to/create-via-api/ — note that all-zones is
  // expressed as a nested object rather than the "*" string the other scopes use
  const $buildResources = (policy: TCloudflareApiTokenPolicy): TCloudflareTokenResources => {
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

  const $createToken = async () => {
    const { tokenId, tokenValue } = await createCloudflareToken({
      accountId,
      connectionApiToken,
      name,
      rotationInterval,
      allowedIps,
      disallowedIps,
      policies: policies.map((policy) => ({
        effect: policy.effect,
        resources: $buildResources(policy),
        permissionGroupIds: policy.permissionGroupIds
      }))
    });

    return { tokenId, apiToken: tokenValue };
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

    await revokeCloudflareTokens({
      accountId,
      connectionApiToken,
      tokenIds: generatedCredentials.map((credential) => credential.tokenId),
      logPrefix: `cloudflareApiTokenRotation: failed to revoke token during cleanup [rotationId=${rotationId}]`
    });

    return callback();
  };

  // The new token is created first so a creation failure leaves the rotation untouched. The previous
  // (inactive) token is then revoked *before* the new credentials are persisted: the callback
  // overwrites the inactive slot, so a post-persist revocation failure would lose the token id and
  // leave the token active with no way to retry its deletion. Revoking first keeps the DB state
  // unchanged on failure, so the next attempt retries the same deletion (a 404 counts as success).
  const rotateCredentials: TRotationFactoryRotateCredentials<TCloudflareApiTokenRotationGeneratedCredentials> = async (
    credentialsToRevoke,
    callback
  ) => {
    const newCredentials = await $createToken();

    if (credentialsToRevoke?.tokenId) {
      try {
        await deleteCloudflareToken({ accountId, connectionApiToken, tokenId: credentialsToRevoke.tokenId });
      } catch (error: unknown) {
        logger.error(
          error,
          `Failed to revoke previous token during rotation [rotationId=${rotationId}] [tokenId=${credentialsToRevoke.tokenId}]`
        );
        // deleteCloudflareToken already throws a descriptive, user-facing BadRequestError
        throw error;
      }
    }

    return callback(newCredentials);
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
    await verifyCloudflareToken({ accountId, tokenValue: activeCredentials.apiToken });
  };

  return {
    issueCredentials,
    revokeCredentials,
    rotateCredentials,
    getSecretsPayload,
    checkActiveCredentials
  };
};
