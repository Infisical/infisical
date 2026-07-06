import crypto from "node:crypto";

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
  TFireworksApiKeyRotationGeneratedCredentials,
  TFireworksApiKeyRotationWithConnection
} from "./fireworks-api-key-rotation-types";

const $createSecret = async (
  apiKey: string,
  accountId: string,
  keyName: string
): Promise<{ secretName: string; secretValue: string }> => {
  const secretValue = crypto.randomBytes(32).toString("base64url");

  try {
    const { data } = await request.post<{ name: string }>(
      `${FIREWORKS_API_BASE_URL}/v1/accounts/${accountId}/secrets`,
      { keyName, value: secretValue },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        }
      }
    );

    if (!data?.name) {
      throw new Error("Invalid response from Fireworks: missing 'name'.");
    }

    return {
      secretName: data.name,
      secretValue
    };
  } catch (error: unknown) {
    if (error instanceof BadRequestError) throw error;
    throw new BadRequestError({
      message: `Failed to create Fireworks secret: ${error instanceof AxiosError ? error.message : "Unknown error"}`
    });
  }
};

const $deleteSecret = async (apiKey: string, accountId: string, secretName: string): Promise<void> => {
  const secretId = secretName.split("/").pop();

  try {
    await request.delete(`${FIREWORKS_API_BASE_URL}/v1/accounts/${accountId}/secrets/${secretId}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      }
    });
  } catch (error: unknown) {
    if (error instanceof AxiosError && error.response?.status === 404) return;
    throw new BadRequestError({
      message: `Failed to delete Fireworks secret: ${error instanceof AxiosError ? error.message : "Unknown error"}`
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
    parameters: { keyName },
    secretsMapping
  } = secretRotation;

  const { apiKey, accountId } = connection.credentials;

  const issueCredentials: TRotationFactoryIssueCredentials<TFireworksApiKeyRotationGeneratedCredentials> = async (
    callback
  ) => {
    const credentials = await $createSecret(apiKey, accountId, keyName);
    return callback(credentials);
  };

  const revokeCredentials: TRotationFactoryRevokeCredentials<TFireworksApiKeyRotationGeneratedCredentials> = async (
    generatedCredentials,
    callback
  ) => {
    if (!generatedCredentials?.length) return callback();

    const results = await Promise.allSettled(
      generatedCredentials.map((credential) => $deleteSecret(apiKey, accountId, credential.secretName))
    );

    results.forEach((result, index) => {
      if (result.status === "rejected") {
        logger.error(
          result.reason,
          `fireworksApiKeyRotation: failed to revoke secret during cleanup [rotationId=${rotationId}] [secretName=${generatedCredentials[index].secretName}]`
        );
      }
    });

    return callback();
  };

  const rotateCredentials: TRotationFactoryRotateCredentials<TFireworksApiKeyRotationGeneratedCredentials> = async (
    credentialsToRevoke,
    callback
  ) => {
    const credentials = await $createSecret(apiKey, accountId, keyName);

    if (credentialsToRevoke?.secretName) {
      try {
        await $deleteSecret(apiKey, accountId, credentialsToRevoke.secretName);
      } catch (revokeError) {
        logger.error(
          revokeError,
          `fireworksApiKeyRotation: failed to revoke previous secret after rotation [rotationId=${rotationId}] [secretName=${credentialsToRevoke.secretName}]`
        );
      }
    }

    return callback(credentials);
  };

  const getSecretsPayload: TRotationFactoryGetSecretsPayload<TFireworksApiKeyRotationGeneratedCredentials> = (
    generatedCredentials
  ) => [{ key: secretsMapping.secretValue, value: generatedCredentials.secretValue }];

  return {
    issueCredentials,
    revokeCredentials,
    rotateCredentials,
    getSecretsPayload
  };
};
