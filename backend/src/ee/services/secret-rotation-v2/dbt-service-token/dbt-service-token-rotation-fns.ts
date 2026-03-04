/* eslint-disable no-await-in-loop */
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
import { logger } from "@app/lib/logger";
import { createDbtError, getDbtUrl, retrieveDbtAccount } from "@app/services/app-connection/dbt";

import {
  TCreateDbtServiceTokenResponse,
  TDbtServiceTokenRotationGeneratedCredentials,
  TDbtServiceTokenRotationWithConnection,
  TGetDbtServiceTokenResponse
} from "./dbt-service-token-rotation-types";

export const dbtServiceTokenRotationFactory: TRotationFactory<
  TDbtServiceTokenRotationWithConnection,
  TDbtServiceTokenRotationGeneratedCredentials
> = (secretRotation) => {
  const {
    connection,
    parameters: { permissionGrants, tokenName },
    secretsMapping
  } = secretRotation;

  /**
   * Creates a new service token for the DBT account.
   */
  const $rotateServiceToken = async () => {
    const instanceUrl = await getDbtUrl(connection);

    try {
      const { data } = await request.post<TCreateDbtServiceTokenResponse>(
        `${instanceUrl}/api/v3/accounts/${connection.credentials.accountId}/service-tokens/`,
        {
          name: tokenName,
          permission_grants: permissionGrants.map((grant) => ({
            permission_set: grant.permissionSet,
            project_id: grant.projectId
          }))
        },
        {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${connection.credentials.apiToken}`
          }
        }
      );

      return {
        tokenId: data.data.id,
        tokenName: data.data.name,
        serviceToken: data.data.token_string
      };
    } catch (error: unknown) {
      if (error instanceof BadRequestError) {
        throw error;
      }

      logger.error(error, "Failed to create service token");
      if (error instanceof AxiosError) {
        const dbtErrorMessage = createDbtError(error);

        if (dbtErrorMessage) {
          throw new BadRequestError({
            message: `Failed to create service token: ${dbtErrorMessage}`
          });
        }

        throw new BadRequestError({
          message: `Failed to create service token: ${error.message || "Unknown error"}`
        });
      }

      throw new BadRequestError({
        message: "Failed to create service token"
      });
    }
  };

  /**
   * Checks if a credential with the given secretId exists.
   */
  const tokenExists = async (tokenId: number): Promise<boolean> => {
    const instanceUrl = await getDbtUrl(connection);

    try {
      const { data } = await request.get<TGetDbtServiceTokenResponse>(
        `${instanceUrl}/api/v3/accounts/${connection.credentials.accountId}/service-tokens/${tokenId}`,
        {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${connection.credentials.apiToken}`
          }
        }
      );

      return data.data.id === tokenId;
    } catch (_) {
      return false;
    }
  };

  /**
   * Revokes a service token from the DBT account using its tokenId.
   * First checks if the service token exists before attempting revocation.
   */
  const revokeCredential = async (tokenId: number) => {
    await retrieveDbtAccount(connection).catch(() => {
      throw new BadRequestError({
        message:
          "Failed to validate connection credentials. Check if your configured DBT app connection credentials are valid."
      });
    });

    // Check if credential exists before attempting revocation
    const exists = await tokenExists(tokenId);
    if (!exists) {
      return; // Service token doesn't exist, nothing to revoke
    }

    const instanceUrl = await getDbtUrl(connection);

    try {
      await request.delete(
        `${instanceUrl}/api/v3/accounts/${connection.credentials.accountId}/service-tokens/${tokenId}`,
        {
          headers: {
            Authorization: `Bearer ${connection.credentials.apiToken}`
          }
        }
      );
    } catch (error: unknown) {
      logger.error(
        { error, responseData: (error as AxiosError)?.response?.data },
        `Failed to remove service token with tokenId ${tokenId}`
      );
      if (error instanceof AxiosError) {
        const dbtErrorMessage = createDbtError(error);

        if (dbtErrorMessage) {
          throw new BadRequestError({
            message: `Failed to remove service token with tokenId ${tokenId}: ${dbtErrorMessage}`
          });
        }

        throw new BadRequestError({
          message: `Failed to remove service token with tokenId ${tokenId}: ${error.message || "Unknown error"}`
        });
      }

      throw new BadRequestError({
        message: `Failed to remove service token with tokenId ${tokenId}: Unknown error`
      });
    }
  };

  /**
   * Issues a new set of credentials.
   */
  const issueCredentials: TRotationFactoryIssueCredentials<TDbtServiceTokenRotationGeneratedCredentials> = async (
    callback
  ) => {
    const credentials = await $rotateServiceToken();
    return callback(credentials);
  };

  /**
   * Revokes a list of credentials.
   */
  const revokeCredentials: TRotationFactoryRevokeCredentials<TDbtServiceTokenRotationGeneratedCredentials> = async (
    credentials,
    callback
  ) => {
    if (!credentials?.length) return callback();

    for (const { tokenId } of credentials) {
      await revokeCredential(tokenId);
    }
    return callback();
  };

  /**
   * Rotates credentials by issuing new ones and revoking the old.
   */
  const rotateCredentials: TRotationFactoryRotateCredentials<TDbtServiceTokenRotationGeneratedCredentials> = async (
    oldCredentials,
    callback
  ) => {
    if (oldCredentials?.tokenId) {
      await revokeCredential(oldCredentials.tokenId);
    }

    const newCredentials = await $rotateServiceToken();
    return callback(newCredentials);
  };

  /**
   * Maps the generated credentials into the secret payload format.
   */
  const getSecretsPayload: TRotationFactoryGetSecretsPayload<TDbtServiceTokenRotationGeneratedCredentials> = ({
    serviceToken
  }) => [{ key: secretsMapping.serviceToken, value: serviceToken }];

  return {
    issueCredentials,
    revokeCredentials,
    rotateCredentials,
    getSecretsPayload
  };
};
