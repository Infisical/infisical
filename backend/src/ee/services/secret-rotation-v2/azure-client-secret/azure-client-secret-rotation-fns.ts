/* eslint-disable no-await-in-loop */
import { AxiosError } from "axios";

import {
  AzureAddPasswordResponse,
  TAzureClientSecretRotationGeneratedCredentials,
  TAzureClientSecretRotationWithConnection
} from "@app/ee/services/secret-rotation-v2/azure-client-secret/azure-client-secret-rotation-types";
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
import { getAzureConnectionAccessToken } from "@app/services/app-connection/azure-client-secrets/azure-client-secrets-connection-fns";

const GRAPH_API_BASE = "https://graph.microsoft.com/v1.0";

type AzureErrorResponse = { error: { message: string } };

const EXPIRY_PADDING_IN_DAYS = 3;
const AZURE_CONCURRENT_REQUEST_MAX_RETRIES = 3;
const AZURE_CONCURRENT_REQUEST_BASE_DELAY_MS = 2000;

const sleep = async (ms = 1000) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const getAzureErrorMessage = (error: AxiosError): string | undefined => {
  const message = (error.response?.data as Partial<AzureErrorResponse> | undefined)?.error?.message;
  return typeof message === "string" ? message : undefined;
};

const getErrorMessage = (error: unknown): string => (error instanceof Error ? error.message : "Unknown error");

// Graph rejects back-to-back writes to the same app registration with a transient "concurrent requests" error
const isAzureConcurrentRequestError = (error: unknown): boolean =>
  error instanceof AxiosError && (getAzureErrorMessage(error) ?? "").toLowerCase().includes("concurrent requests");

const withAzureConcurrentRequestRetry = async <T>(fn: () => Promise<T>, context: string, attempt = 0): Promise<T> => {
  try {
    return await fn();
  } catch (error: unknown) {
    if (!isAzureConcurrentRequestError(error) || attempt >= AZURE_CONCURRENT_REQUEST_MAX_RETRIES) throw error;

    const delay = AZURE_CONCURRENT_REQUEST_BASE_DELAY_MS * 2 ** attempt;
    logger.info(
      `secretRotation: Azure concurrent request error on ${context}, retrying in ${delay}ms (attempt ${attempt + 1}/${AZURE_CONCURRENT_REQUEST_MAX_RETRIES})`
    );
    await sleep(delay);
    return withAzureConcurrentRequestRetry(fn, context, attempt + 1);
  }
};

export const azureClientSecretRotationFactory: TRotationFactory<
  TAzureClientSecretRotationWithConnection,
  TAzureClientSecretRotationGeneratedCredentials
> = (secretRotation, appConnectionDAL, kmsService) => {
  const {
    connection,
    parameters: { objectId, clientId: clientIdParam },
    secretsMapping,
    rotationInterval
  } = secretRotation;

  /**
   * Creates a new client secret for the Azure app.
   */
  const $rotateClientSecret = async () => {
    const accessToken = await getAzureConnectionAccessToken(connection.id, appConnectionDAL, kmsService);
    const endpoint = `${GRAPH_API_BASE}/applications/${objectId}/addPassword`;

    const now = new Date();
    const formattedDate = `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(
      2,
      "0"
    )}-${now.getFullYear()}`;

    const endDateTime = new Date();
    endDateTime.setDate(now.getDate() + rotationInterval * 2 + EXPIRY_PADDING_IN_DAYS); // give 72 hour buffer

    try {
      const { data } = await request.post<AzureAddPasswordResponse>(
        endpoint,
        {
          passwordCredential: {
            displayName: `Infisical Rotated Secret (${formattedDate})`,
            endDateTime: endDateTime.toISOString()
          }
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          }
        }
      );

      if (!data?.secretText || !data?.keyId) {
        throw new Error("Invalid response from Azure: missing secretText or keyId.");
      }

      return {
        clientSecret: data.secretText,
        keyId: data.keyId,
        clientId: clientIdParam
      };
    } catch (error: unknown) {
      if (error instanceof AxiosError) {
        const message = getAzureErrorMessage(error);
        throw new BadRequestError({
          message: `Failed to add client secret to Azure app ${objectId}: ${
            message || error.message || "Unknown error"
          }`
        });
      }
      throw new BadRequestError({
        message: "Unable to validate connection: verify credentials"
      });
    }
  };

  /**
   * Checks if a credential with the given keyId exists.
   */
  const credentialExists = async (keyId: string): Promise<boolean> => {
    const accessToken = await getAzureConnectionAccessToken(connection.id, appConnectionDAL, kmsService);
    const endpoint = `${GRAPH_API_BASE}/applications/${objectId}/passwordCredentials`;

    try {
      const { data } = await withAzureConcurrentRequestRetry(
        () =>
          request.get<{ value: Array<{ keyId: string }> }>(endpoint, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json"
            }
          }),
        "list credentials"
      );

      return data.value?.some((credential) => credential.keyId === keyId) || false;
    } catch (error: unknown) {
      if (error instanceof AxiosError) {
        const message = getAzureErrorMessage(error);
        throw new BadRequestError({
          message: `Failed to check credential existence for app ${objectId}: ${
            message || error.message || "Unknown error"
          }`
        });
      }
      throw new BadRequestError({
        message: "Unable to validate connection: verify credentials"
      });
    }
  };

  const $removeClientSecret = async (keyId: string) => {
    const accessToken = await getAzureConnectionAccessToken(connection.id, appConnectionDAL, kmsService);
    const endpoint = `${GRAPH_API_BASE}/applications/${objectId}/removePassword`;

    try {
      await withAzureConcurrentRequestRetry(
        () =>
          request.post(
            endpoint,
            { keyId },
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json"
              }
            }
          ),
        "remove credential"
      );
    } catch (error: unknown) {
      if (error instanceof AxiosError) {
        const message = getAzureErrorMessage(error);
        throw new BadRequestError({
          message: `Failed to remove client secret with keyId ${keyId} from app ${objectId}: ${
            message || error.message || "Unknown error"
          }`
        });
      }
      throw new BadRequestError({
        message: "Unable to validate connection: verify credentials"
      });
    }
  };

  /**
   * Revokes a client secret from the Azure app using its keyId.
   * First checks if the credential exists before attempting revocation.
   */
  const revokeCredential = async (keyId: string) => {
    const exists = await credentialExists(keyId);
    if (!exists) {
      return; // Credential doesn't exist, nothing to revoke
    }

    await $removeClientSecret(keyId);
  };

  /**
   * Issues a new set of credentials.
   */
  const issueCredentials: TRotationFactoryIssueCredentials<TAzureClientSecretRotationGeneratedCredentials> = async (
    callback
  ) => {
    const credentials = await $rotateClientSecret();

    // 2.5 years as expiry is set to x2 interval for the inactive period of credential
    if (rotationInterval > Math.floor(365 * 2.5) - EXPIRY_PADDING_IN_DAYS) {
      throw new BadRequestError({ message: "Azure does not support token duration over 5 years" });
    }

    return callback(credentials);
  };

  /**
   * Revokes a list of credentials.
   */
  const revokeCredentials: TRotationFactoryRevokeCredentials<TAzureClientSecretRotationGeneratedCredentials> = async (
    credentials,
    callback
  ) => {
    if (!credentials?.length) return callback();

    for (const { keyId } of credentials) {
      await revokeCredential(keyId);
      await sleep();
    }
    return callback();
  };

  /**
   * Rotates credentials by issuing new ones and revoking the old.
   */
  const rotateCredentials: TRotationFactoryRotateCredentials<TAzureClientSecretRotationGeneratedCredentials> = async (
    oldCredentials,
    callback
  ) => {
    const newCredentials = await $rotateClientSecret();
    if (oldCredentials?.keyId) {
      try {
        await revokeCredential(oldCredentials.keyId);
      } catch (revokeError: unknown) {
        // only two credentials are tracked, so persisting the new secret now would drop the old keyId from tracking
        try {
          await sleep(AZURE_CONCURRENT_REQUEST_BASE_DELAY_MS);
          await $removeClientSecret(newCredentials.keyId);
        } catch (cleanupError: unknown) {
          const cleanupMessage = `The newly created client secret with keyId ${newCredentials.keyId} could not be cleaned up from app ${objectId} and may need to be removed manually`;
          throw new BadRequestError({
            message: `${getErrorMessage(revokeError)} ${cleanupMessage}: ${getErrorMessage(cleanupError)}`
          });
        }
        throw revokeError;
      }
    }

    return callback(newCredentials);
  };

  /**
   * Maps the generated credentials into the secret payload format.
   */
  const getSecretsPayload: TRotationFactoryGetSecretsPayload<TAzureClientSecretRotationGeneratedCredentials> = ({
    clientSecret
  }) => [
    { key: secretsMapping.clientSecret, value: clientSecret },
    { key: secretsMapping.clientId, value: clientIdParam }
  ];

  const checkActiveCredentials: TRotationFactoryCheckActiveCredentials<
    TAzureClientSecretRotationGeneratedCredentials
  > = async ({ clientId: activeClientId, clientSecret }) => {
    const tenantId = connection.credentials.tenantId || "common";
    const tokenEndpoint = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

    try {
      await request.post(
        tokenEndpoint,
        {
          grant_type: "client_credentials",
          client_id: activeClientId,
          client_secret: clientSecret,
          scope: "https://graph.microsoft.com/.default"
        },
        {
          headers: { "Content-Type": "application/x-www-form-urlencoded" }
        }
      );
    } catch (error: unknown) {
      if (error instanceof AxiosError) {
        let message: string | undefined;
        if (
          error.response?.data &&
          typeof error.response.data === "object" &&
          "error_description" in error.response.data &&
          typeof (error.response.data as { error_description?: string }).error_description === "string"
        ) {
          message = (error.response.data as { error_description: string }).error_description;
        }
        throw new BadRequestError({
          message: `Azure client credentials check failed: ${message ?? error.message ?? "Unknown error"}`
        });
      }
      throw error;
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
