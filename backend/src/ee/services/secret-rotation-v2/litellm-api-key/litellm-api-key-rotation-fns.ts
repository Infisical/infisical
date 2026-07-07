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
import { removeTrailingSlash } from "@app/lib/fn/string";
import { safeRequest } from "@app/lib/validator";

import {
  TLiteLLMApiKeyGenerateResponse,
  TLiteLLMApiKeyRotationGeneratedCredentials,
  TLiteLLMApiKeyRotationWithConnection
} from "./litellm-api-key-rotation-types";

type LiteLLMErrorResponse = { error?: { message?: string }; detail?: unknown };

const isLiteLLMErrorResponse = (data: unknown): data is LiteLLMErrorResponse => {
  return typeof data === "object" && data !== null && ("error" in data || "detail" in data);
};

const createErrorMessage = (error: unknown) => {
  if (error instanceof AxiosError) {
    if (error.response?.data && isLiteLLMErrorResponse(error.response.data)) {
      const litellmError = error.response.data;
      if (litellmError.error?.message) {
        return litellmError.error.message;
      }
      if (litellmError.detail) {
        return typeof litellmError.detail === "string" ? litellmError.detail : JSON.stringify(litellmError.detail);
      }
    }
    if (error.message) {
      return error.message;
    }
  }
  return "Unknown error";
};

export const litellmApiKeyRotationFactory: TRotationFactory<
  TLiteLLMApiKeyRotationWithConnection,
  TLiteLLMApiKeyRotationGeneratedCredentials
> = (secretRotation) => {
  const {
    connection,
    parameters: { name, userId, teamId, models, additionalOptions },
    secretsMapping
  } = secretRotation;

  const provisioningApiKey = connection.credentials.apiKey;
  const baseUrl = removeTrailingSlash(connection.credentials.instanceUrl);

  /**
   * Creates a new virtual key via the LiteLLM key-management API.
   */
  const $createApiKey = async () => {
    try {
      const userOptions: Record<string, unknown> = additionalOptions
        ? (JSON.parse(additionalOptions) as Record<string, unknown>)
        : {};

      // Infisical-owned fields always win over user-supplied options. The timestamp suffix embeds the
      // creation time and guarantees uniqueness across rotations (create-before-revoke).
      const requestBody: Record<string, unknown> = {
        ...userOptions,
        ...(userId ? { user_id: userId } : {}),
        ...(teamId ? { team_id: teamId } : {}),
        ...(models?.length ? { models } : {}),
        key_alias: `${name}-${Date.now()}`,
        auto_rotate: false,
        send_invite_email: false
      };

      const { data } = await safeRequest.post<TLiteLLMApiKeyGenerateResponse>(`${baseUrl}/key/generate`, requestBody, {
        headers: {
          Authorization: `Bearer ${provisioningApiKey}`,
          "Content-Type": "application/json"
        }
      });

      return {
        apiKey: data.key
      };
    } catch (error: unknown) {
      throw new BadRequestError({
        message: `Failed to create LiteLLM API key: ${createErrorMessage(error)}`
      });
    }
  };

  /**
   * Deletes a virtual key via the LiteLLM key-management API. LiteLLM deletes by the key value.
   */
  const $deleteApiKey = async (apiKey: string) => {
    try {
      await safeRequest.post(
        `${baseUrl}/key/delete`,
        { keys: [apiKey] },
        {
          headers: {
            Authorization: `Bearer ${provisioningApiKey}`,
            "Content-Type": "application/json"
          }
        }
      );
    } catch (error: unknown) {
      // If the key no longer exists, consider it already deleted
      if (error instanceof AxiosError && (error.response?.status === 404 || error.response?.status === 400)) {
        return;
      }

      throw new BadRequestError({
        message: `Failed to delete LiteLLM API key: ${createErrorMessage(error)}`
      });
    }
  };

  /**
   * Issues a new set of credentials.
   */
  const issueCredentials: TRotationFactoryIssueCredentials<TLiteLLMApiKeyRotationGeneratedCredentials> = async (
    callback
  ) => {
    const credentials = await $createApiKey();
    return callback(credentials);
  };

  /**
   * Revokes a list of credentials.
   */
  const revokeCredentials: TRotationFactoryRevokeCredentials<TLiteLLMApiKeyRotationGeneratedCredentials> = async (
    credentials,
    callback
  ) => {
    if (!credentials?.length) return callback();

    await Promise.all(credentials.map(({ apiKey }) => $deleteApiKey(apiKey)));

    return callback();
  };

  /**
   * Rotates credentials by issuing new ones and revoking the old.
   */
  const rotateCredentials: TRotationFactoryRotateCredentials<TLiteLLMApiKeyRotationGeneratedCredentials> = async (
    oldCredentials,
    callback
  ) => {
    // First create the new credentials
    const newCredentials = await $createApiKey();

    // Store the new credentials via callback
    const result = await callback(newCredentials);

    // Then delete the old key if it exists
    if (oldCredentials?.apiKey) {
      await $deleteApiKey(oldCredentials.apiKey);
    }

    return result;
  };

  /**
   * Maps the generated credentials into the secret payload format.
   */
  const getSecretsPayload: TRotationFactoryGetSecretsPayload<TLiteLLMApiKeyRotationGeneratedCredentials> = ({
    apiKey
  }) => [{ key: secretsMapping.apiKey, value: apiKey }];

  const checkActiveCredentials: TRotationFactoryCheckActiveCredentials<
    TLiteLLMApiKeyRotationGeneratedCredentials
  > = async ({ apiKey }) => {
    try {
      // Verify the rotated key exists using the management key.
      await safeRequest.get(`${baseUrl}/key/info`, {
        params: { key: apiKey },
        headers: { Authorization: `Bearer ${provisioningApiKey}` }
      });
    } catch (error: unknown) {
      throw new BadRequestError({
        message: `LiteLLM API key verification failed: ${createErrorMessage(error)}`
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
