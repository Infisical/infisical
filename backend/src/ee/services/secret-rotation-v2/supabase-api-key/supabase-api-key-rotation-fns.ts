import { AxiosError } from "axios";

import {
  TRotationFactory,
  TRotationFactoryGetSecretsPayload,
  TRotationFactoryIssueCredentials,
  TRotationFactoryRevokeCredentials,
  TRotationFactoryRotateCredentials
} from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";
import { BadRequestError } from "@app/lib/errors";
import { safeRequest } from "@app/lib/validator";
import {
  getSupabaseAuthHeaders,
  getSupabaseInstanceUrl
} from "@app/services/app-connection/supabase/supabase-connection-public-client";

import { SupabaseApiKeyType } from "./supabase-api-key-rotation-schemas";
import {
  TSupabaseApiKeyCreateResponse,
  TSupabaseApiKeyRotationGeneratedCredentials,
  TSupabaseApiKeyRotationWithConnection
} from "./supabase-api-key-rotation-types";

const createErrorMessage = (error: unknown) => {
  if (error instanceof AxiosError) {
    const data = error.response?.data as { message?: string } | undefined;
    if (data?.message) {
      return data.message;
    }
    if (error.message) {
      return error.message;
    }
  }
  return (error as Error)?.message ?? "Unknown error";
};

export const supabaseApiKeyRotationFactory: TRotationFactory<
  TSupabaseApiKeyRotationWithConnection,
  TSupabaseApiKeyRotationGeneratedCredentials
> = (secretRotation) => {
  const {
    connection,
    parameters: { projectRef, keyType },
    secretsMapping
  } = secretRotation;

  const connectionConfig = {
    method: connection.method,
    app: connection.app,
    credentials: connection.credentials,
    orgId: connection.orgId
  };

  const $createApiKey = async () => {
    const baseUrl = getSupabaseInstanceUrl(connectionConfig);
    const headers = getSupabaseAuthHeaders(connectionConfig);

    try {
      const { data } = await safeRequest.post<TSupabaseApiKeyCreateResponse>(
        `${baseUrl}/v1/projects/${encodeURIComponent(projectRef)}/api-keys`,
        {
          type: keyType === SupabaseApiKeyType.Publishable ? "publishable" : "secret",
          name: `infisical_rotated_${keyType}_${Date.now()}`,
          description: "Managed by Infisical secret rotation"
        },
        {
          headers: {
            ...headers,
            "Content-Type": "application/json"
          },
          params: { reveal: true }
        }
      );

      if (!data.api_key || !data.id) {
        throw new Error("Invalid response from Supabase: missing 'api_key' or 'id'.");
      }

      return {
        apiKey: data.api_key,
        keyId: data.id
      };
    } catch (error: unknown) {
      throw new BadRequestError({
        message: `Failed to create Supabase API key: ${createErrorMessage(error)}`
      });
    }
  };

  const $deleteApiKey = async (keyId: string) => {
    const baseUrl = getSupabaseInstanceUrl(connectionConfig);
    const headers = getSupabaseAuthHeaders(connectionConfig);

    try {
      await safeRequest.delete(
        `${baseUrl}/v1/projects/${encodeURIComponent(projectRef)}/api-keys/${encodeURIComponent(keyId)}`,
        {
          headers,
          params: { reason: "Rotated by Infisical" }
        }
      );
    } catch (error: unknown) {
      if (error instanceof AxiosError && error.response?.status === 404) {
        return;
      }

      throw new BadRequestError({
        message: `Failed to delete Supabase API key: ${createErrorMessage(error)}`
      });
    }
  };

  const issueCredentials: TRotationFactoryIssueCredentials<TSupabaseApiKeyRotationGeneratedCredentials> = async (
    callback
  ) => {
    const credentials = await $createApiKey();
    return callback(credentials);
  };

  const revokeCredentials: TRotationFactoryRevokeCredentials<TSupabaseApiKeyRotationGeneratedCredentials> = async (
    credentials,
    callback
  ) => {
    if (!credentials?.length) return callback();

    await Promise.all(credentials.map(({ keyId }) => $deleteApiKey(keyId)));

    return callback();
  };

  const rotateCredentials: TRotationFactoryRotateCredentials<TSupabaseApiKeyRotationGeneratedCredentials> = async (
    oldCredentials,
    callback
  ) => {
    const newCredentials = await $createApiKey();

    const result = await callback(newCredentials);

    if (oldCredentials?.keyId) {
      await $deleteApiKey(oldCredentials.keyId);
    }

    return result;
  };

  const getSecretsPayload: TRotationFactoryGetSecretsPayload<TSupabaseApiKeyRotationGeneratedCredentials> = ({
    apiKey
  }) => [{ key: secretsMapping.apiKey, value: apiKey }];

  return {
    issueCredentials,
    revokeCredentials,
    rotateCredentials,
    getSecretsPayload
  };
};
