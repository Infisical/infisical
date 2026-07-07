import { AxiosError } from "axios";

import {
  TRotationFactory,
  TRotationFactoryGetSecretsPayload,
  TRotationFactoryIssueCredentials,
  TRotationFactoryRevokeCredentials,
  TRotationFactoryRotateCredentials
} from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";
import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { FIREWORKS_API_BASE_URL } from "@app/services/app-connection/fireworks/fireworks-connection-fns";

import {
  TFireworksApiKeyRotationGeneratedCredential,
  TFireworksApiKeyRotationGeneratedCredentials,
  TFireworksApiKeyRotationWithConnection
} from "./fireworks-api-key-rotation-types";

type TFireworksCreateApiKeyResponse = {
  keyId: string;
  key: string;
};

const $createApiKey = async (
  apiKey: string,
  accountId: string,
  userId: string,
  displayName: string
): Promise<{ keyId: string; apiKey: string }> => {
  try {
    const { data } = await request.post<TFireworksCreateApiKeyResponse>(
      `${FIREWORKS_API_BASE_URL}/v1/accounts/${accountId}/users/${userId}/apiKeys`,
      { apiKey: { displayName } },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        }
      }
    );

    if (!data?.key) {
      throw new Error("Invalid response from Fireworks: missing API key data.");
    }

    return {
      keyId: data.keyId,
      apiKey: data.key
    };
  } catch (error: unknown) {
    if (error instanceof BadRequestError) throw error;
    throw new BadRequestError({
      message: `Failed to create Fireworks API key: ${error instanceof AxiosError ? error.message : "Unknown error"}`
    });
  }
};

const $checkApiKey = async (generatedApiKey: string, accountId: string): Promise<void> => {
  try {
    await request.get(`${FIREWORKS_API_BASE_URL}/v1/accounts/${accountId}`, {
      headers: {
        Authorization: `Bearer ${generatedApiKey}`
      }
    });
  } catch (error: unknown) {
    throw new BadRequestError({
      message: `Fireworks API key verification failed: ${error instanceof AxiosError ? error.message : "Unknown error"}`
    });
  }
};

const $deleteApiKey = async (authKey: string, accountId: string, userId: string, keyId: string): Promise<void> => {
  try {
    await request.post(
      `${FIREWORKS_API_BASE_URL}/v1/accounts/${accountId}/users/${userId}/apiKeys:delete`,
      { keyId },
      {
        headers: {
          Authorization: `Bearer ${authKey}`,
          "Content-Type": "application/json"
        }
      }
    );
  } catch (error: unknown) {
    if (error instanceof AxiosError && error.response?.status === 404) return;
    throw new BadRequestError({
      message: `Failed to delete Fireworks API key: ${error instanceof AxiosError ? error.message : "Unknown error"}`
    });
  }
};

export const fireworksApiKeyRotationFactory: TRotationFactory<
  TFireworksApiKeyRotationWithConnection,
  TFireworksApiKeyRotationGeneratedCredentials
> = (secretRotation) => {
  const {
    id: rotationId,
    connection,
    parameters: { serviceAccountUserId },
    secretsMapping
  } = secretRotation;

  const { apiKey, accountId } = connection.credentials;

  const generateDisplayName = () => `Infisical-rotation-${Date.now()}`;

  const issueCredentials: TRotationFactoryIssueCredentials<TFireworksApiKeyRotationGeneratedCredentials> = async (
    callback
  ) => {
    const credentials = await $createApiKey(apiKey, accountId, serviceAccountUserId, generateDisplayName());
    return callback(credentials);
  };

  const revokeCredentials: TRotationFactoryRevokeCredentials<TFireworksApiKeyRotationGeneratedCredentials> = async (
    generatedCredentials,
    callback
  ) => {
    if (!generatedCredentials?.length) return callback();

    const results = await Promise.allSettled(
      generatedCredentials.map((credential) => $deleteApiKey(apiKey, accountId, serviceAccountUserId, credential.keyId))
    );

    results.forEach((result, index) => {
      if (result.status === "rejected") {
        logger.error(
          result.reason,
          `fireworksApiKeyRotation: failed to revoke API key during cleanup [rotationId=${rotationId}] [keyId=${generatedCredentials[index].keyId}]`
        );
      }
    });

    return callback();
  };

  const rotateCredentials: TRotationFactoryRotateCredentials<TFireworksApiKeyRotationGeneratedCredentials> = async (
    credentialsToRevoke,
    callback
  ) => {
    const credentials = await $createApiKey(apiKey, accountId, serviceAccountUserId, generateDisplayName());

    if (credentialsToRevoke?.keyId) {
      try {
        await $deleteApiKey(apiKey, accountId, serviceAccountUserId, credentialsToRevoke.keyId);
      } catch (revokeError) {
        logger.error(
          revokeError,
          `fireworksApiKeyRotation: failed to revoke previous API key after rotation [rotationId=${rotationId}] [keyId=${credentialsToRevoke.keyId}]`
        );
      }
    }

    return callback(credentials);
  };

  const checkActiveCredentials = async ({ apiKey: generatedKey }: TFireworksApiKeyRotationGeneratedCredential) => {
    await $checkApiKey(generatedKey, accountId);
  };

  const getSecretsPayload: TRotationFactoryGetSecretsPayload<TFireworksApiKeyRotationGeneratedCredentials> = (
    generatedCredentials
  ) => [{ key: secretsMapping.apiKey, value: generatedCredentials.apiKey }];

  return {
    issueCredentials,
    revokeCredentials,
    rotateCredentials,
    getSecretsPayload,
    checkActiveCredentials
  };
};
