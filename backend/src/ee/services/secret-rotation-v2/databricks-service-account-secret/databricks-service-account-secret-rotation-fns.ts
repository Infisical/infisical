/* eslint-disable no-await-in-loop */
import { AxiosError } from "axios";

import {
  TDatabricksServiceAccountSecretRotationGeneratedCredentials,
  TDatabricksServiceAccountSecretRotationWithConnection
} from "@app/ee/services/secret-rotation-v2/databricks-service-account-secret/databricks-service-account-secret-rotation-types";
import {
  TRotationFactory,
  TRotationFactoryGetSecretsPayload,
  TRotationFactoryIssueCredentials,
  TRotationFactoryRevokeCredentials,
  TRotationFactoryRotateCredentials
} from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";
import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { removeTrailingSlash } from "@app/lib/fn";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";
import { getDatabricksConnectionAccessToken } from "@app/services/app-connection/databricks/databricks-connection-fns";

const DELAY_MS = 1000;
const EXPIRY_PADDING_IN_DAYS = 3;

const sleep = async () =>
  new Promise((resolve) => {
    setTimeout(resolve, DELAY_MS);
  });

export const databricksServiceAccountSecretRotationFactory: TRotationFactory<
  TDatabricksServiceAccountSecretRotationWithConnection,
  TDatabricksServiceAccountSecretRotationGeneratedCredentials
> = (secretRotation, appConnectionDAL, kmsService) => {
  const {
    connection,
    parameters: { servicePrincipalId, clientId: clientIdParam },
    secretsMapping,
    rotationInterval
  } = secretRotation;

  const $rotateClientSecret = async () => {
    const accessToken = await getDatabricksConnectionAccessToken(connection, appConnectionDAL, kmsService);
    const workspaceUrl = removeTrailingSlash(connection.credentials.workspaceUrl);

    await blockLocalAndPrivateIpAddresses(workspaceUrl);

    const endpoint = `${workspaceUrl}/api/2.0/accounts/servicePrincipals/${servicePrincipalId}/credentials/secrets`;

    const now = new Date();
    const endDateTime = new Date();
    endDateTime.setDate(now.getDate() + rotationInterval * 2 + EXPIRY_PADDING_IN_DAYS);

    try {
      const { data } = await request.post<unknown>(
        endpoint,
        {
          expire_time: endDateTime.toISOString()
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          }
        }
      );

      if (!data || typeof data !== "object") {
        throw new BadRequestError({
          message: `Invalid response from Databricks: expected object, got ${typeof data}`
        });
      }

      const response = data as Record<string, unknown>;
      const clientSecret = (response.secret || response.client_secret) as string | undefined;
      const secretId = response.id as string | undefined;

      if (!clientSecret || !secretId) {
        const responseStr = JSON.stringify(data, null, 2);
        throw new BadRequestError({
          message: `Invalid response from Databricks: missing 'secret' or 'id'. Response: ${responseStr}`
        });
      }

      return {
        clientSecret,
        secretId,
        clientId: clientIdParam || ""
      };
    } catch (error: unknown) {
      let errorMessage = "Unknown error";

      if (error instanceof AxiosError && error.response?.data) {
        const responseData: unknown = error.response.data;

        if (typeof responseData === "string") {
          errorMessage = responseData;
        } else if (typeof responseData === "object" && responseData !== null) {
          const data = responseData as Record<string, unknown>;
          errorMessage =
            (data.error as string | undefined) || (data.message as string | undefined) || JSON.stringify(responseData);
        }
      } else if (error instanceof AxiosError && error.message) {
        errorMessage = error.message;
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }

      throw new BadRequestError({
        message: `Failed to generate secret for Databricks service principal ${servicePrincipalId}: ${errorMessage}`
      });
    }
  };

  const $listClientSecrets = async () => {
    const accessToken = await getDatabricksConnectionAccessToken(connection, appConnectionDAL, kmsService);
    const workspaceUrl = removeTrailingSlash(connection.credentials.workspaceUrl);

    await blockLocalAndPrivateIpAddresses(workspaceUrl);

    let endpoint = `${workspaceUrl}/api/2.0/accounts/servicePrincipals/${servicePrincipalId}/credentials/secrets`;

    try {
      const { data } = await request.get<{ secrets: Array<{ id: string; client_secret?: string }> }>(endpoint, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        }
      });

      return data.secrets ?? [];
    } catch (error: unknown) {
      if (error instanceof AxiosError && (error.response?.status === 403 || error.response?.status === 404)) {
        endpoint = `${workspaceUrl}/api/2.0/preview/scim/v2/ServicePrincipals/${servicePrincipalId}/credentials/secrets`;

        try {
          const { data: workspaceData } = await request.get<{ secrets: Array<{ id: string; client_secret?: string }> }>(
            endpoint,
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json"
              }
            }
          );

          return workspaceData.secrets ?? [];
        } catch {
          return [];
        }
      }
      return [];
    }
  };

  const revokeCredential = async (secretId: string) => {
    const accessToken = await getDatabricksConnectionAccessToken(connection, appConnectionDAL, kmsService);
    const workspaceUrl = removeTrailingSlash(connection.credentials.workspaceUrl);

    await blockLocalAndPrivateIpAddresses(workspaceUrl);

    let endpoint = `${workspaceUrl}/api/2.0/accounts/servicePrincipals/${servicePrincipalId}/credentials/secrets/${secretId}`;

    try {
      await request.delete(endpoint, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        }
      });
    } catch (error: unknown) {
      if (error instanceof AxiosError && (error.response?.status === 403 || error.response?.status === 404)) {
        endpoint = `${workspaceUrl}/api/2.0/preview/scim/v2/ServicePrincipals/${servicePrincipalId}/credentials/secrets/${secretId}`;

        try {
          await request.delete(endpoint, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json"
            }
          });
          return;
        } catch (workspaceError: unknown) {
          let errorMessage = "Unknown error";

          if (workspaceError instanceof AxiosError && workspaceError.response?.data) {
            const responseData: unknown = workspaceError.response.data;

            if (typeof responseData === "string") {
              errorMessage = responseData;
            } else if (typeof responseData === "object" && responseData !== null) {
              const data = responseData as Record<string, unknown>;
              errorMessage = (data.error as string | undefined) || workspaceError.message || "Unknown error";
            }
          } else if (workspaceError instanceof Error) {
            errorMessage = workspaceError.message;
          }

          throw new BadRequestError({
            message: `Failed to revoke secret with id ${secretId} for service principal ${servicePrincipalId}: ${errorMessage}`
          });
        }
      }

      if (error instanceof AxiosError && error.response?.status === 404) {
        return;
      }

      let errorMessage = "Unknown error";

      if (error instanceof AxiosError && error.response?.data) {
        const responseData: unknown = error.response.data;

        if (typeof responseData === "object" && responseData !== null) {
          const data = responseData as Record<string, unknown>;
          errorMessage = (data.error as string | undefined) || error.message || "Unknown error";
        }
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }

      throw new BadRequestError({
        message: `Failed to revoke secret with id ${secretId} for service principal ${servicePrincipalId}: ${errorMessage}`
      });
    }
  };

  const issueCredentials: TRotationFactoryIssueCredentials<
    TDatabricksServiceAccountSecretRotationGeneratedCredentials
  > = async (callback) => {
    if (rotationInterval > Math.floor(365 * 2.5) - EXPIRY_PADDING_IN_DAYS) {
      throw new BadRequestError({
        message: "Databricks does not support OAuth secret duration over 2.5 years"
      });
    }

    const credentials = await $rotateClientSecret();
    return callback(credentials);
  };

  const revokeCredentials: TRotationFactoryRevokeCredentials<
    TDatabricksServiceAccountSecretRotationGeneratedCredentials
  > = async (credentials, callback) => {
    if (!credentials?.length) return callback();

    for (const { secretId } of credentials) {
      await revokeCredential(secretId);
      await sleep();
    }
    return callback();
  };

  const rotateCredentials: TRotationFactoryRotateCredentials<
    TDatabricksServiceAccountSecretRotationGeneratedCredentials
  > = async (oldCredentials, callback, activeCredentials) => {
    const existingSecrets = await $listClientSecrets();

    if (oldCredentials?.secretId) {
      await revokeCredential(oldCredentials.secretId);
    } else if (activeCredentials) {
      const otherSecrets = existingSecrets.filter((secret) => secret.id !== activeCredentials.secretId);
      if (otherSecrets.length > 0) {
        const oldestSecret = otherSecrets[0];
        if (oldestSecret) {
          await revokeCredential(oldestSecret.id);
        }
      }
    }

    const newCredentials = await $rotateClientSecret();
    return callback(newCredentials);
  };

  const getSecretsPayload: TRotationFactoryGetSecretsPayload<
    TDatabricksServiceAccountSecretRotationGeneratedCredentials
  > = ({ clientSecret, clientId }) => [
    { key: secretsMapping.clientId, value: clientId },
    { key: secretsMapping.clientSecret, value: clientSecret }
  ];

  return {
    issueCredentials,
    revokeCredentials,
    rotateCredentials,
    getSecretsPayload
  };
};
