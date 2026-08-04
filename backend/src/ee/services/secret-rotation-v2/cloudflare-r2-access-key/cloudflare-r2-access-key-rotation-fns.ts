import {
  TRotationFactory,
  TRotationFactoryCheckActiveCredentials,
  TRotationFactoryGetSecretsPayload,
  TRotationFactoryIssueCredentials,
  TRotationFactoryRevokeCredentials,
  TRotationFactoryRotateCredentials
} from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";
import {
  CloudflareTokenPolicyEffect,
  createCloudflareToken,
  deleteCloudflareToken,
  revokeCloudflareTokens,
  verifyCloudflareToken
} from "@app/ee/services/secret-rotation-v2/shared/cloudflare-token";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import {
  getCloudflareErrorMessage,
  listCloudflarePermissionGroups
} from "@app/services/app-connection/cloudflare/cloudflare-connection-fns";

import {
  CLOUDFLARE_R2_ACCESS_LEVEL_PERMISSION_GROUPS,
  CLOUDFLARE_R2_BUCKET_PERMISSION_SCOPE
} from "./cloudflare-r2-access-key-rotation-constants";
import {
  TCloudflareR2AccessKeyRotationGeneratedCredentials,
  TCloudflareR2AccessKeyRotationWithConnection
} from "./cloudflare-r2-access-key-rotation-types";

export const cloudflareR2AccessKeyRotationFactory: TRotationFactory<
  TCloudflareR2AccessKeyRotationWithConnection,
  TCloudflareR2AccessKeyRotationGeneratedCredentials
> = (secretRotation) => {
  const {
    id: rotationId,
    connection,
    rotationInterval,
    parameters: { name, buckets, accessLevel, allowedIps, disallowedIps },
    secretsMapping
  } = secretRotation;

  const { accountId, apiToken: connectionApiToken } = connection.credentials;

  /**
   * R2 grants object permissions per bucket, keyed by the bucket's name and jurisdiction. Cloudflare
   * does not validate these keys when the token is created, so a bucket renamed or deleted after the
   * rotation was configured yields a token that grants nothing rather than an error.
   */
  const bucketResources = Object.fromEntries(
    buckets.map(({ name: bucketName, jurisdiction }) => [
      `${CLOUDFLARE_R2_BUCKET_PERMISSION_SCOPE}.${accountId}_${jurisdiction}_${bucketName}`,
      "*"
    ])
  );

  /**
   * R2's S3-compatible secret access key is the hex sha256 of the API token's value, and the access key
   * id is the token's id. https://developers.cloudflare.com/r2/api/tokens/
   */
  const $toSecretAccessKey = (tokenValue: string) =>
    crypto.nativeCrypto.createHash("sha256").update(tokenValue).digest("hex");

  const $listPermissionGroups = async () => {
    try {
      return await listCloudflarePermissionGroups(connection);
    } catch (error: unknown) {
      throw new BadRequestError({
        message: `Failed to list Cloudflare permission groups: ${getCloudflareErrorMessage(error)}`
      });
    }
  };

  const $resolvePermissionGroupIds = async () => {
    const requiredNames = CLOUDFLARE_R2_ACCESS_LEVEL_PERMISSION_GROUPS[accessLevel];

    const permissionGroups = await $listPermissionGroups();

    return requiredNames.map((requiredName) => {
      // groups reporting no scopes are accepted so an upstream response change can't break rotation
      const permissionGroup = permissionGroups.find(
        (group) =>
          group.name === requiredName &&
          (!group.scopes.length || group.scopes.includes(CLOUDFLARE_R2_BUCKET_PERMISSION_SCOPE))
      );

      if (!permissionGroup) {
        throw new BadRequestError({
          message: `Cloudflare permission group "${requiredName}" was not found on this account. Verify the connection's API token can read token permission groups.`
        });
      }

      return permissionGroup.id;
    });
  };

  const $createCredentials = async () => {
    const permissionGroupIds = await $resolvePermissionGroupIds();

    const { tokenId, tokenValue } = await createCloudflareToken({
      accountId,
      connectionApiToken,
      name,
      rotationInterval,
      allowedIps,
      disallowedIps,
      policies: [
        {
          effect: CloudflareTokenPolicyEffect.Allow,
          resources: bucketResources,
          permissionGroupIds
        }
      ]
    });

    return {
      apiToken: tokenValue,
      accessKeyId: tokenId,
      secretAccessKey: $toSecretAccessKey(tokenValue)
    };
  };

  const issueCredentials: TRotationFactoryIssueCredentials<TCloudflareR2AccessKeyRotationGeneratedCredentials> = async (
    callback
  ) => {
    const credentials = await $createCredentials();

    return callback(credentials);
  };

  const revokeCredentials: TRotationFactoryRevokeCredentials<
    TCloudflareR2AccessKeyRotationGeneratedCredentials
  > = async (generatedCredentials, callback) => {
    if (!generatedCredentials?.length) return callback();

    await revokeCloudflareTokens({
      accountId,
      connectionApiToken,
      // the access key id *is* the underlying API token's id
      tokenIds: generatedCredentials.map((credential) => credential.accessKeyId),
      logPrefix: `cloudflareR2AccessKeyRotation: failed to revoke token during cleanup [rotationId=${rotationId}]`
    });

    return callback();
  };

  // The new access key is created first so a creation failure leaves the rotation untouched. The
  // previous (inactive) key is then revoked *before* the new credentials are persisted: the callback
  // overwrites the inactive slot, so a post-persist revocation failure would lose the key id and
  // leave the underlying token active with no way to retry its deletion. Revoking first keeps the DB
  // state unchanged on failure, so the next attempt retries the same deletion (a 404 counts as success).
  const rotateCredentials: TRotationFactoryRotateCredentials<
    TCloudflareR2AccessKeyRotationGeneratedCredentials
  > = async (credentialsToRevoke, callback) => {
    const newCredentials = await $createCredentials();

    if (credentialsToRevoke?.accessKeyId) {
      try {
        await deleteCloudflareToken({ accountId, connectionApiToken, tokenId: credentialsToRevoke.accessKeyId });
      } catch (error) {
        logger.error(
          error,
          `Failed to revoke previous token during rotation [rotationId=${rotationId}] [tokenId=${credentialsToRevoke.accessKeyId}]`
        );
        // deleteCloudflareToken already throws a descriptive, user-facing BadRequestError
        throw error;
      }
    }

    return callback(newCredentials);
  };

  const getSecretsPayload: TRotationFactoryGetSecretsPayload<TCloudflareR2AccessKeyRotationGeneratedCredentials> = (
    generatedCredentials
  ) => [
    { key: secretsMapping.accessKeyId, value: generatedCredentials.accessKeyId },
    { key: secretsMapping.secretAccessKey, value: generatedCredentials.secretAccessKey }
  ];

  // Introspecting the token is the only check that works for every access level — an S3 probe would
  // fail for a write-only key, and listing buckets is an account-level permission the token lacks.
  const checkActiveCredentials: TRotationFactoryCheckActiveCredentials<
    TCloudflareR2AccessKeyRotationGeneratedCredentials
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
