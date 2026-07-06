import { AxiosError } from "axios";

import {
  TRotationFactory,
  TRotationFactoryCheckActiveCredentials,
  TRotationFactoryGetSecretsPayload,
  TRotationFactoryIssueCredentials,
  TRotationFactoryRevokeCredentials,
  TRotationFactoryRotateCredentials
} from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";
import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { OPENAI_API_BASE_URL } from "@app/services/app-connection/openai";

import {
  TOpenAIAdminApiKeyCreateResponse,
  TOpenAIAdminApiKeyRotationGeneratedCredentials,
  TOpenAIAdminApiKeyRotationWithConnection
} from "./openai-admin-api-key-rotation-types";

type OpenAIErrorResponse = { error?: { message: string; type?: string; code?: string } };

const isOpenAIErrorResponse = (data: unknown): data is OpenAIErrorResponse => {
  return typeof data === "object" && data !== null && "error" in data;
};

const createErrorMessage = (error: unknown) => {
  if (error instanceof AxiosError) {
    if (error.response?.data && isOpenAIErrorResponse(error.response.data)) {
      const openAIError = error.response.data;
      if (openAIError.error?.message) {
        return openAIError.error.message;
      }
    }
    if (error.message) {
      return error.message;
    }
  }
  return "Unknown error";
};

export const openAIAdminApiKeyRotationFactory: TRotationFactory<
  TOpenAIAdminApiKeyRotationWithConnection,
  TOpenAIAdminApiKeyRotationGeneratedCredentials
> = (secretRotation) => {
  const {
    connection,
    parameters: { name },
    secretsMapping
  } = secretRotation;

  const provisioningApiKey = connection.credentials.apiKey;

  /**
   * Creates a new admin API key via the OpenAI Admin API.
   */
  const $createApiKey = async () => {
    try {
      // Suffix with a timestamp so the active and retired keys have distinct names on the
      // OpenAI platform during the dual-credential window. Deletion is by key id, so the
      // name itself is only used for identification in the OpenAI dashboard.
      const keyName = `${name}-${Date.now()}`;

      const { data } = await request.post<TOpenAIAdminApiKeyCreateResponse>(
        `${OPENAI_API_BASE_URL}/organization/admin_api_keys`,
        { name: keyName },
        {
          headers: {
            Authorization: `Bearer ${provisioningApiKey}`,
            "Content-Type": "application/json"
          }
        }
      );

      if (!data.value || !data.id) {
        throw new Error("Invalid response from OpenAI: missing 'value' or 'id'.");
      }

      return {
        apiKey: data.value,
        keyId: data.id
      };
    } catch (error: unknown) {
      throw new BadRequestError({
        message: `Failed to create OpenAI admin API key: ${createErrorMessage(error)}`
      });
    }
  };

  /**
   * Deletes an admin API key via the OpenAI Admin API.
   */
  const $deleteApiKey = async (keyId: string) => {
    try {
      await request.delete(`${OPENAI_API_BASE_URL}/organization/admin_api_keys/${keyId}`, {
        headers: {
          Authorization: `Bearer ${provisioningApiKey}`,
          "Content-Type": "application/json"
        }
      });
    } catch (error: unknown) {
      // If key doesn't exist (404), consider it already deleted
      if (error instanceof AxiosError && error.response?.status === 404) {
        return;
      }

      throw new BadRequestError({
        message: `Failed to delete OpenAI admin API key: ${createErrorMessage(error)}`
      });
    }
  };

  /**
   * Issues a new set of credentials.
   */
  const issueCredentials: TRotationFactoryIssueCredentials<TOpenAIAdminApiKeyRotationGeneratedCredentials> = async (
    callback
  ) => {
    const credentials = await $createApiKey();
    return callback(credentials);
  };

  /**
   * Revokes a list of credentials.
   */
  const revokeCredentials: TRotationFactoryRevokeCredentials<TOpenAIAdminApiKeyRotationGeneratedCredentials> = async (
    credentials,
    callback
  ) => {
    if (!credentials?.length) return callback();

    await Promise.all(credentials.map(({ keyId }) => $deleteApiKey(keyId)));

    return callback();
  };

  /**
   * Rotates credentials by issuing new ones and revoking the old.
   */
  const rotateCredentials: TRotationFactoryRotateCredentials<TOpenAIAdminApiKeyRotationGeneratedCredentials> = async (
    oldCredentials,
    callback
  ) => {
    // First create the new credentials
    const newCredentials = await $createApiKey();

    // Store the new credentials via callback
    const result = await callback(newCredentials);

    // Then delete the old key if it exists
    if (oldCredentials?.keyId) {
      await $deleteApiKey(oldCredentials.keyId);
    }

    return result;
  };

  /**
   * Maps the generated credentials into the secret payload format.
   */
  const getSecretsPayload: TRotationFactoryGetSecretsPayload<TOpenAIAdminApiKeyRotationGeneratedCredentials> = ({
    apiKey
  }) => [{ key: secretsMapping.apiKey, value: apiKey }];

  const checkActiveCredentials: TRotationFactoryCheckActiveCredentials<
    TOpenAIAdminApiKeyRotationGeneratedCredentials
  > = async ({ apiKey }) => {
    try {
      // A valid admin key can list admin keys; a 200 confirms the rotated key is still active.
      await request.get(`${OPENAI_API_BASE_URL}/organization/admin_api_keys?limit=1`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        }
      });
    } catch (error: unknown) {
      throw new BadRequestError({
        message: `OpenAI admin API key verification failed: ${createErrorMessage(error)}`
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
