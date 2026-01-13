/* eslint-disable no-await-in-loop */
import { AxiosError } from "axios";

import {
  TDatabricksServicePrincipalSecretRotationGeneratedCredentials,
  TDatabricksServicePrincipalSecretRotationWithConnection
} from "@app/ee/services/secret-rotation-v2/databricks-service-principal-secret/databricks-service-principal-secret-rotation-types";
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
const MAX_DATABRICKS_SECRETS = 4;
const MAX_SECRET_LIFETIME = 730; // from databricks
const MAX_ROTATION_INTERVAL_DAYS = Math.floor((MAX_SECRET_LIFETIME - EXPIRY_PADDING_IN_DAYS) / 2); // needs to be half, since it lives two intervals

const sleep = async () =>
  new Promise((resolve) => {
    setTimeout(resolve, DELAY_MS);
  });

export const databricksServicePrincipalSecretRotationFactory: TRotationFactory<
  TDatabricksServicePrincipalSecretRotationWithConnection,
  TDatabricksServicePrincipalSecretRotationGeneratedCredentials
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

    const lifetimeSeconds = (rotationInterval * 2 + EXPIRY_PADDING_IN_DAYS) * 24 * 60 * 60;
    const lifetime = `${lifetimeSeconds}s`;

    try {
      const { data } = await request.post<unknown>(
        endpoint,
        {
          lifetime
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

    const endpoint = `${workspaceUrl}/api/2.0/accounts/servicePrincipals/${servicePrincipalId}/credentials/secrets`;

    try {
      const { data } = await request.get<{ secrets: Array<{ id: string; client_secret?: string }> }>(endpoint, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        }
      });

      return data.secrets ?? [];
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
        message: `Failed to list secrets for service principal ${servicePrincipalId}: ${errorMessage}`
      });
    }
  };

  const revokeCredential = async (secretId: string) => {
    const accessToken = await getDatabricksConnectionAccessToken(connection, appConnectionDAL, kmsService);
    const workspaceUrl = removeTrailingSlash(connection.credentials.workspaceUrl);

    await blockLocalAndPrivateIpAddresses(workspaceUrl);

    const endpoint = `${workspaceUrl}/api/2.0/accounts/servicePrincipals/${servicePrincipalId}/credentials/secrets/${secretId}`;

    try {
      await request.delete(endpoint, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        }
      });
    } catch (error: unknown) {
      if (error instanceof AxiosError && error.response?.status === 404) {
        return;
      }

      let errorMessage = "Unknown error";

      if (error instanceof AxiosError && error.response?.data) {
        const responseData: unknown = error.response.data;

        if (typeof responseData === "string") {
          errorMessage = responseData;
        } else if (typeof responseData === "object" && responseData !== null) {
          const data = responseData as Record<string, unknown>;
          errorMessage = (data.error as string | undefined) || error.message || "Unknown error";
        }
      } else if (error instanceof AxiosError && error.message) {
        errorMessage = error.message;
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }

      throw new BadRequestError({
        message: `Failed to revoke secret with id ${secretId} for service principal ${servicePrincipalId}: ${errorMessage}`
      });
    }
  };

  const issueCredentials: TRotationFactoryIssueCredentials<
    TDatabricksServicePrincipalSecretRotationGeneratedCredentials
  > = async (callback) => {
    if (rotationInterval > MAX_ROTATION_INTERVAL_DAYS) {
      throw new BadRequestError({
        message: `Databricks does not support OAuth secret duration over ${MAX_SECRET_LIFETIME} days. Rotation interval must be less than or equal to ${MAX_ROTATION_INTERVAL_DAYS} to accomodate this.`
      });
    }

    const credentials = await $rotateClientSecret();
    return callback(credentials);
  };

  const revokeCredentials: TRotationFactoryRevokeCredentials<
    TDatabricksServicePrincipalSecretRotationGeneratedCredentials
  > = async (credentials, callback) => {
    if (!credentials?.length) return callback();

    for (const { secretId } of credentials) {
      await revokeCredential(secretId);
      await sleep();
    }
    return callback();
  };

  const rotateCredentials: TRotationFactoryRotateCredentials<
    TDatabricksServicePrincipalSecretRotationGeneratedCredentials
  > = async (oldCredentials, callback) => {
    if (rotationInterval > MAX_ROTATION_INTERVAL_DAYS) {
      throw new BadRequestError({
        message: `Databricks does not support OAuth secret duration over ${MAX_SECRET_LIFETIME} days. Rotation interval must be less than or equal to ${MAX_ROTATION_INTERVAL_DAYS} to accomodate this.`
      });
    }

    if (oldCredentials?.secretId) {
      await revokeCredential(oldCredentials.secretId);
    }

    const existingSecrets = await $listClientSecrets();
    if (existingSecrets.length >= MAX_DATABRICKS_SECRETS) {
      throw new BadRequestError({
        message: `Cannot create new secret: service principal ${servicePrincipalId} already has ${existingSecrets.length} secrets. Databricks allows a maximum of ${MAX_DATABRICKS_SECRETS} secrets per service principal. Please revoke at least one secret before rotating.`
      });
    }

    const newCredentials = await $rotateClientSecret();
    return callback(newCredentials);
  };

  const getSecretsPayload: TRotationFactoryGetSecretsPayload<
    TDatabricksServicePrincipalSecretRotationGeneratedCredentials
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
