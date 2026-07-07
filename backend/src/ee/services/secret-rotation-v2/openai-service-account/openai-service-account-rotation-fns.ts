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
  TOpenAIServiceAccountCreateResponse,
  TOpenAIServiceAccountRotationGeneratedCredentials,
  TOpenAIServiceAccountRotationWithConnection
} from "./openai-service-account-rotation-types";

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

export const openAIServiceAccountRotationFactory: TRotationFactory<
  TOpenAIServiceAccountRotationWithConnection,
  TOpenAIServiceAccountRotationGeneratedCredentials
> = (secretRotation) => {
  const {
    connection,
    parameters: { projectId, name },
    secretsMapping
  } = secretRotation;

  const provisioningApiKey = connection.credentials.apiKey;

  const provisioningHeaders = {
    Authorization: `Bearer ${provisioningApiKey}`,
    "Content-Type": "application/json"
  };

  /**
   * Creates a new project service account via the OpenAI Admin API. Its API key is
   * returned only once in the create response.
   */
  const $createServiceAccount = async () => {
    try {
      const serviceAccountName = `${name}-${Date.now()}`;

      const { data } = await request.post<TOpenAIServiceAccountCreateResponse>(
        `${OPENAI_API_BASE_URL}/organization/projects/${projectId}/service_accounts`,
        { name: serviceAccountName },
        { headers: provisioningHeaders }
      );

      if (!data.api_key?.value || !data.id) {
        throw new Error("Invalid response from OpenAI: missing service account 'id' or 'api_key.value'.");
      }

      return {
        apiKey: data.api_key.value,
        serviceAccountId: data.id
      };
    } catch (error: unknown) {
      throw new BadRequestError({
        message: `Failed to create OpenAI service account: ${createErrorMessage(error)}`
      });
    }
  };

  /**
   * Deletes a project service account via the OpenAI Admin API. Deleting the service
   * account also invalidates its API key.
   */
  const $deleteServiceAccount = async (serviceAccountId: string) => {
    try {
      await request.delete(
        `${OPENAI_API_BASE_URL}/organization/projects/${projectId}/service_accounts/${serviceAccountId}`,
        {
          headers: provisioningHeaders
        }
      );
    } catch (error: unknown) {
      // If the service account doesn't exist (404), consider it already deleted
      if (error instanceof AxiosError && error.response?.status === 404) {
        return;
      }

      throw new BadRequestError({
        message: `Failed to delete OpenAI service account: ${createErrorMessage(error)}`
      });
    }
  };

  /**
   * Issues a new set of credentials.
   */
  const issueCredentials: TRotationFactoryIssueCredentials<TOpenAIServiceAccountRotationGeneratedCredentials> = async (
    callback
  ) => {
    const credentials = await $createServiceAccount();
    return callback(credentials);
  };

  /**
   * Revokes a list of credentials.
   */
  const revokeCredentials: TRotationFactoryRevokeCredentials<
    TOpenAIServiceAccountRotationGeneratedCredentials
  > = async (credentials, callback) => {
    if (!credentials?.length) return callback();

    await Promise.all(credentials.map(({ serviceAccountId }) => $deleteServiceAccount(serviceAccountId)));

    return callback();
  };

  /**
   * Rotates credentials by issuing new ones and revoking the old.
   */
  const rotateCredentials: TRotationFactoryRotateCredentials<
    TOpenAIServiceAccountRotationGeneratedCredentials
  > = async (oldCredentials, callback) => {
    // First create the new credentials
    const newCredentials = await $createServiceAccount();

    // Store the new credentials via callback
    const result = await callback(newCredentials);

    // Then delete the old service account if it exists
    if (oldCredentials?.serviceAccountId) {
      await $deleteServiceAccount(oldCredentials.serviceAccountId);
    }

    return result;
  };

  /**
   * Maps the generated credentials into the secret payload format.
   */
  const getSecretsPayload: TRotationFactoryGetSecretsPayload<TOpenAIServiceAccountRotationGeneratedCredentials> = ({
    apiKey
  }) => [{ key: secretsMapping.apiKey, value: apiKey }];

  const checkActiveCredentials: TRotationFactoryCheckActiveCredentials<
    TOpenAIServiceAccountRotationGeneratedCredentials
  > = async ({ apiKey }) => {
    try {
      // A valid service account key can list models; a 200 confirms the rotated key is still active.
      await request.get(`${OPENAI_API_BASE_URL}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        validateStatus: (status) => status === 200
      });
    } catch (error: unknown) {
      throw new BadRequestError({
        message: `OpenAI service account key verification failed: ${createErrorMessage(error)}`
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
