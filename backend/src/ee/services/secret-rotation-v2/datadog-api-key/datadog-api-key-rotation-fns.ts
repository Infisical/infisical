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
import { getDatadogAuthHeaders, getDatadogBaseUrl, getDatadogErrorMessage } from "@app/services/app-connection/datadog";

import {
  TDatadogApiKeyRotationGeneratedCredentials,
  TDatadogApiKeyRotationWithConnection
} from "./datadog-api-key-rotation-types";

type TDatadogCreateApiKeyResponse = {
  data: {
    id: string;
    type: string;
    attributes: {
      name: string;
      key: string;
      created_at?: string;
      last4?: string;
    };
  };
};

// exists only one right now, but this is an enum on their side.
enum DatadogAPIKeyType {
  API = "api_keys"
}

export const datadogApiKeyRotationFactory: TRotationFactory<
  TDatadogApiKeyRotationWithConnection,
  TDatadogApiKeyRotationGeneratedCredentials
> = (secretRotation) => {
  const {
    id: rotationId,
    connection,
    parameters: { name },
    secretsMapping
  } = secretRotation;

  const authHeaders = getDatadogAuthHeaders(connection);

  const $createApiKey = async () => {
    const baseUrl = await getDatadogBaseUrl(connection);

    try {
      const { data } = await safeRequest.post<TDatadogCreateApiKeyResponse>(
        `${baseUrl}/api/v2/api_keys`,
        {
          data: {
            type: DatadogAPIKeyType.API,
            attributes: {
              name
            }
          }
        },
        {
          headers: { ...authHeaders, "Content-Type": "application/json" }
        }
      );

      if (!data?.data?.id || !data?.data?.attributes?.key) {
        throw new BadRequestError({
          message: "Datadog API key response missing 'id' or 'attributes.key'"
        });
      }

      return { apiKeyId: data.data.id, apiKey: data.data.attributes.key };
    } catch (error: unknown) {
      if (error instanceof BadRequestError) throw error;
      throw new BadRequestError({
        message: `Failed to create Datadog API key: ${getDatadogErrorMessage(error)}`
      });
    }
  };

  const $deleteApiKey = async (apiKeyId: string) => {
    const baseUrl = await getDatadogBaseUrl(connection);

    try {
      await safeRequest.delete(`${baseUrl}/api/v2/api_keys/${encodeURIComponent(apiKeyId)}`, {
        headers: authHeaders
      });
    } catch (error: unknown) {
      // 404 means the key is already gone — treat as success since revocation is the desired end state.
      if (error instanceof AxiosError && error.response?.status === 404) return;
      throw new BadRequestError({
        message: `Failed to delete Datadog API key ${apiKeyId}: ${getDatadogErrorMessage(error)}`
      });
    }
  };

  const issueCredentials: TRotationFactoryIssueCredentials<TDatadogApiKeyRotationGeneratedCredentials> = async (
    callback
  ) => {
    const credentials = await $createApiKey();
    return callback(credentials);
  };

  const revokeCredentials: TRotationFactoryRevokeCredentials<TDatadogApiKeyRotationGeneratedCredentials> = async (
    generatedCredentials,
    callback
  ) => {
    if (!generatedCredentials?.length) return callback();

    const results = await Promise.allSettled(
      generatedCredentials.map((credential) => $deleteApiKey(credential.apiKeyId))
    );

    results.forEach((result, index) => {
      if (result.status === "rejected") {
        logger.error(
          result.reason,
          `datadogApiKeyRotation: failed to revoke key during cleanup [rotationId=${rotationId}] [keyId=${generatedCredentials[index].apiKeyId}]`
        );
      }
    });

    return callback();
  };

  // Issue first, then revoke the previously-inactive key. If issue fails, the old key remains usable
  // and we avoid leaving the rotation without a working key.
  const rotateCredentials: TRotationFactoryRotateCredentials<TDatadogApiKeyRotationGeneratedCredentials> = async (
    credentialsToRevoke,
    callback
  ) => {
    const credentials = await $createApiKey();

    if (credentialsToRevoke?.apiKeyId) {
      try {
        await $deleteApiKey(credentialsToRevoke.apiKeyId);
      } catch (revokeError) {
        logger.error(
          revokeError,
          `datadogApiKeyRotation: failed to revoke previous key after rotation [rotationId=${rotationId}] [keyId=${credentialsToRevoke.apiKeyId}]`
        );
      }
    }

    return callback(credentials);
  };

  const getSecretsPayload: TRotationFactoryGetSecretsPayload<TDatadogApiKeyRotationGeneratedCredentials> = (
    generatedCredentials
  ) => [
    { key: secretsMapping.apiKeyId, value: generatedCredentials.apiKeyId },
    { key: secretsMapping.apiKey, value: generatedCredentials.apiKey }
  ];

  const checkActiveCredentials: TRotationFactoryCheckActiveCredentials<
    TDatadogApiKeyRotationGeneratedCredentials
  > = async ({ apiKey }) => {
    const baseUrl = await getDatadogBaseUrl(connection);

    try {
      // Validate the freshly-issued API key against the connection's known-good application key.
      await safeRequest.get(`${baseUrl}/api/v2/validate`, {
        headers: { "DD-API-KEY": apiKey }
      });
    } catch (error: unknown) {
      if (error instanceof BadRequestError) throw error;
      throw new BadRequestError({
        message: `Datadog API key verification failed: ${getDatadogErrorMessage(error)}`
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
