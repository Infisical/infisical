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
import { OPEN_ROUTER_API_BASE_URL } from "@app/services/app-connection/open-router";

import {
  TOpenRouterApiKeyCreateResponse,
  TOpenRouterApiKeyRotationGeneratedCredentials,
  TOpenRouterApiKeyRotationWithConnection
} from "./open-router-api-key-rotation-types";

type OpenRouterErrorResponse = { error?: { message: string; code?: string } };

const isOpenRouterErrorResponse = (data: unknown): data is OpenRouterErrorResponse => {
  return typeof data === "object" && data !== null && "error" in data;
};

const createErrorMessage = (error: unknown) => {
  if (error instanceof AxiosError) {
    if (error.response?.data && isOpenRouterErrorResponse(error.response.data)) {
      const openRouterError = error.response.data;
      if (openRouterError.error?.message) {
        return openRouterError.error.message;
      }
    }
    if (error.message) {
      return error.message;
    }
  }
  return "Unknown error";
};

export const openRouterApiKeyRotationFactory: TRotationFactory<
  TOpenRouterApiKeyRotationWithConnection,
  TOpenRouterApiKeyRotationGeneratedCredentials
> = (secretRotation) => {
  const {
    connection,
    parameters: { name, limit, limitReset, includeByokInLimit },
    secretsMapping
  } = secretRotation;

  const provisioningApiKey = connection.credentials.apiKey;

  /**
   * Creates a new API key via OpenRouter Provisioning API.
   */
  const $createApiKey = async () => {
    try {
      const requestBody: {
        name: string;
        limit?: number | null;
        limit_reset?: string | null;
        include_byok_in_limit?: boolean | null;
      } = { name };

      if (limit !== undefined && limit !== null) {
        requestBody.limit = limit;
      }
      if (limitReset !== undefined && limitReset !== null) {
        requestBody.limit_reset = limitReset;
      }
      if (includeByokInLimit !== undefined && includeByokInLimit !== null) {
        requestBody.include_byok_in_limit = includeByokInLimit;
      }

      const { data } = await request.post<TOpenRouterApiKeyCreateResponse>(
        `${OPEN_ROUTER_API_BASE_URL}/keys`,
        requestBody,
        {
          headers: {
            Authorization: `Bearer ${provisioningApiKey}`,
            "Content-Type": "application/json"
          }
        }
      );

      if (!data.key || !data.data?.hash) {
        throw new Error("Invalid response from OpenRouter: missing 'key' or 'hash'.");
      }

      return {
        apiKey: data.key,
        keyHash: data.data.hash
      };
    } catch (error: unknown) {
      throw new BadRequestError({
        message: `Failed to create OpenRouter API key: ${createErrorMessage(error)}`
      });
    }
  };

  /**
   * Deletes an API key via OpenRouter Provisioning API.
   */
  const $deleteApiKey = async (keyHash: string) => {
    try {
      await request.delete(`${OPEN_ROUTER_API_BASE_URL}/keys/${keyHash}`, {
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
        message: `Failed to delete OpenRouter API key: ${createErrorMessage(error)}`
      });
    }
  };

  /**
   * Issues a new set of credentials.
   */
  const issueCredentials: TRotationFactoryIssueCredentials<TOpenRouterApiKeyRotationGeneratedCredentials> = async (
    callback
  ) => {
    const credentials = await $createApiKey();
    return callback(credentials);
  };

  /**
   * Revokes a list of credentials.
   */
  const revokeCredentials: TRotationFactoryRevokeCredentials<TOpenRouterApiKeyRotationGeneratedCredentials> = async (
    credentials,
    callback
  ) => {
    if (!credentials?.length) return callback();

    await Promise.all(credentials.map(({ keyHash }) => $deleteApiKey(keyHash)));

    return callback();
  };

  /**
   * Rotates credentials by issuing new ones and revoking the old.
   */
  const rotateCredentials: TRotationFactoryRotateCredentials<TOpenRouterApiKeyRotationGeneratedCredentials> = async (
    oldCredentials,
    callback
  ) => {
    // First create the new credentials
    const newCredentials = await $createApiKey();

    // Store the new credentials via callback
    const result = await callback(newCredentials);

    // Then delete the old key if it exists
    if (oldCredentials?.keyHash) {
      await $deleteApiKey(oldCredentials.keyHash);
    }

    return result;
  };

  /**
   * Maps the generated credentials into the secret payload format.
   */
  const getSecretsPayload: TRotationFactoryGetSecretsPayload<TOpenRouterApiKeyRotationGeneratedCredentials> = ({
    apiKey
  }) => [{ key: secretsMapping.apiKey, value: apiKey }];

  return {
    issueCredentials,
    revokeCredentials,
    rotateCredentials,
    getSecretsPayload
  };
};
