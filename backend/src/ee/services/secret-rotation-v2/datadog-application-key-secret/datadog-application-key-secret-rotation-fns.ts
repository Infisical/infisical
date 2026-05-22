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
import { logger } from "@app/lib/logger";
import { getDatadogAuthHeaders, getDatadogBaseUrl, getDatadogErrorMessage } from "@app/services/app-connection/datadog";

import {
  TDatadogApplicationKeySecretRotationGeneratedCredentials,
  TDatadogApplicationKeySecretRotationWithConnection
} from "./datadog-application-key-secret-rotation-types";

type TDatadogCreateApplicationKeyResponse = {
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

export const datadogApplicationKeySecretRotationFactory: TRotationFactory<
  TDatadogApplicationKeySecretRotationWithConnection,
  TDatadogApplicationKeySecretRotationGeneratedCredentials
> = (secretRotation) => {
  const {
    id: rotationId,
    connection,
    parameters: { serviceAccountId },
    secretsMapping
  } = secretRotation;

  const authHeaders = getDatadogAuthHeaders(connection.credentials);

  const $createApplicationKey = async () => {
    const baseUrl = await getDatadogBaseUrl(connection);

    try {
      const { data } = await request.post<TDatadogCreateApplicationKeyResponse>(
        `${baseUrl}/api/v2/service_accounts/${encodeURIComponent(serviceAccountId)}/application_keys`,
        {
          data: {
            type: "application_keys",
            attributes: {
              name: `infisical-rotation-${Date.now()}`
            }
          }
        },
        {
          headers: { ...authHeaders, "Content-Type": "application/json" }
        }
      );

      if (!data?.data?.id || !data?.data?.attributes?.key) {
        throw new BadRequestError({
          message: "Datadog application key response missing 'id' or 'attributes.key'"
        });
      }

      return { applicationKeyId: data.data.id, applicationKey: data.data.attributes.key };
    } catch (error: unknown) {
      if (error instanceof BadRequestError) throw error;
      throw new BadRequestError({
        message: `Failed to create Datadog application key for service account ${serviceAccountId}: ${getDatadogErrorMessage(error)}`
      });
    }
  };

  const $deleteApplicationKey = async (applicationKeyId: string) => {
    const baseUrl = await getDatadogBaseUrl(connection);

    try {
      await request.delete(
        `${baseUrl}/api/v2/service_accounts/${encodeURIComponent(serviceAccountId)}/application_keys/${encodeURIComponent(applicationKeyId)}`,
        { headers: authHeaders }
      );
    } catch (error: unknown) {
      // 404 means the key is already gone — treat as success since revocation is the desired end state.
      if (error instanceof AxiosError && error.response?.status === 404) return;
      throw new BadRequestError({
        message: `Failed to delete Datadog application key ${applicationKeyId} for service account ${serviceAccountId}: ${getDatadogErrorMessage(error)}`
      });
    }
  };

  const $issueAndValidateKey = async () => {
    const created = await $createApplicationKey();

    return created;
  };

  const issueCredentials: TRotationFactoryIssueCredentials<
    TDatadogApplicationKeySecretRotationGeneratedCredentials
  > = async (callback) => {
    const credentials = await $issueAndValidateKey();
    return callback(credentials);
  };

  const revokeCredentials: TRotationFactoryRevokeCredentials<
    TDatadogApplicationKeySecretRotationGeneratedCredentials
  > = async (generatedCredentials, callback) => {
    if (!generatedCredentials?.length) return callback();

    const results = await Promise.allSettled(
      generatedCredentials.map((credential) => $deleteApplicationKey(credential.applicationKeyId))
    );

    results.forEach((result, index) => {
      if (result.status === "rejected") {
        logger.error(
          result.reason,
          `datadogApplicationKeySecretRotation: failed to revoke key during cleanup [rotationId=${rotationId}] [keyId=${generatedCredentials[index].applicationKeyId}]`
        );
      }
    });

    return callback();
  };

  // Issue first, then revoke the previously-inactive key. If issue fails, the old key remains usable
  // and we avoid leaving the service account keyless.
  const rotateCredentials: TRotationFactoryRotateCredentials<
    TDatadogApplicationKeySecretRotationGeneratedCredentials
  > = async (credentialsToRevoke, callback) => {
    const credentials = await $issueAndValidateKey();

    if (credentialsToRevoke?.applicationKeyId) {
      try {
        await $deleteApplicationKey(credentialsToRevoke.applicationKeyId);
      } catch (revokeError) {
        logger.error(
          revokeError,
          `datadogApplicationKeySecretRotation: failed to revoke previous key after rotation [rotationId=${rotationId}] [keyId=${credentialsToRevoke.applicationKeyId}]`
        );
      }
    }

    return callback(credentials);
  };

  const getSecretsPayload: TRotationFactoryGetSecretsPayload<
    TDatadogApplicationKeySecretRotationGeneratedCredentials
  > = (generatedCredentials) => [
    { key: secretsMapping.applicationKeyId, value: generatedCredentials.applicationKeyId },
    { key: secretsMapping.applicationKey, value: generatedCredentials.applicationKey }
  ];

  const checkActiveCredentials: TRotationFactoryCheckActiveCredentials<
    TDatadogApplicationKeySecretRotationGeneratedCredentials
  > = async ({ applicationKey }) => {
    const baseUrl = await getDatadogBaseUrl(connection);

    try {
      await request.get(`${baseUrl}/api/v2/permissions`, {
        headers: { "DD-API-KEY": connection.credentials.apiKey, "DD-APPLICATION-KEY": applicationKey }
      });
    } catch (error: unknown) {
      if (error instanceof BadRequestError) throw error;
      throw new BadRequestError({
        message: `Datadog application key verification failed: ${getDatadogErrorMessage(error)}`
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
