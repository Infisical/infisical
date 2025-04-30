/* eslint-disable no-await-in-loop */
import { AxiosError } from "axios";

import {
  AzureAddPasswordResponse,
  TAzureClientSecretRotationGeneratedCredentials,
  TAzureClientSecretRotationWithConnection
} from "@app/ee/services/secret-rotation-v2/azure-client-secret/azure-client-secret-rotation-types";
import {
  TRotationFactory,
  TRotationFactoryGetSecretsPayload,
  TRotationFactoryIssueCredentials,
  TRotationFactoryRevokeCredentials,
  TRotationFactoryRotateCredentials
} from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";
import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { getAzureConnectionAccessToken } from "@app/services/app-connection/azure-client-secrets";

const GRAPH_API_BASE = "https://graph.microsoft.com/v1.0";

type AzureErrorResponse = { error: { message: string } };

const sleep = async () =>
  new Promise((resolve) => {
    setTimeout(resolve, 1000);
  });

export const azureClientSecretRotationFactory: TRotationFactory<
  TAzureClientSecretRotationWithConnection,
  TAzureClientSecretRotationGeneratedCredentials
> = (secretRotation, appConnectionDAL, kmsService) => {
  const {
    connection,
    parameters: { objectId, clientId: clientIdParam },
    secretsMapping
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
    endDateTime.setFullYear(now.getFullYear() + 5);

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
        let message;
        if (
          error.response?.data &&
          typeof error.response.data === "object" &&
          "error" in error.response.data &&
          typeof (error.response.data as AzureErrorResponse).error.message === "string"
        ) {
          message = (error.response.data as AzureErrorResponse).error.message;
        }
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
   * Revokes a client secret from the Azure app using its keyId.
   */
  const revokeCredential = async (keyId: string) => {
    const accessToken = await getAzureConnectionAccessToken(connection.id, appConnectionDAL, kmsService);
    const endpoint = `${GRAPH_API_BASE}/applications/${objectId}/removePassword`;

    try {
      await request.post(
        endpoint,
        { keyId },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          }
        }
      );
    } catch (error: unknown) {
      if (error instanceof AxiosError) {
        let message;
        if (
          error.response?.data &&
          typeof error.response.data === "object" &&
          "error" in error.response.data &&
          typeof (error.response.data as AzureErrorResponse).error.message === "string"
        ) {
          message = (error.response.data as AzureErrorResponse).error.message;
        }
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
   * Issues a new set of credentials.
   */
  const issueCredentials: TRotationFactoryIssueCredentials<TAzureClientSecretRotationGeneratedCredentials> = async (
    callback
  ) => {
    const credentials = await $rotateClientSecret();
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
      await revokeCredential(oldCredentials.keyId);
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

  return {
    issueCredentials,
    revokeCredentials,
    rotateCredentials,
    getSecretsPayload
  };
};
