/* eslint-disable no-case-declarations */
import { AxiosError, AxiosResponse } from "axios";

import { getConfig } from "@app/lib/config/env";
import { request } from "@app/lib/config/request";
import { BadRequestError, InternalServerError, NotFoundError } from "@app/lib/errors";
import {
  decryptAppConnectionCredentials,
  encryptAppConnectionCredentials,
  getAppConnectionMethodName
} from "@app/services/app-connection/app-connection-fns";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

import { TAppConnectionDALFactory } from "../app-connection-dal";
import { AppConnection } from "../app-connection-enums";
import { AzureKeyVaultConnectionMethod } from "./azure-key-vault-connection-enums";
import {
  ExchangeCodeAzureResponse,
  TAzureKeyVaultConnectionClientSecretCredentials,
  TAzureKeyVaultConnectionConfig,
  TAzureKeyVaultConnectionCredentials
} from "./azure-key-vault-connection-types";

export const getAzureConnectionAccessToken = async (
  connectionId: string,
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById" | "updateById">,
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">
) => {
  const appConnection = await appConnectionDAL.findById(connectionId);

  if (!appConnection) {
    throw new NotFoundError({ message: `Connection with ID '${connectionId}' not found` });
  }

  if (
    appConnection.app !== AppConnection.AzureKeyVault &&
    appConnection.app !== AppConnection.AzureAppConfiguration &&
    appConnection.app !== AppConnection.AzureClientSecrets
  ) {
    throw new BadRequestError({ message: `Connection with ID '${connectionId}' is not a valid Azure connection` });
  }

  const currentTime = Date.now();

  switch (appConnection.method) {
    case AzureKeyVaultConnectionMethod.OAuth:
      const appCfg = getConfig();
      if (
        !appCfg.INF_APP_CONNECTION_AZURE_KEY_VAULT_CLIENT_ID ||
        !appCfg.INF_APP_CONNECTION_AZURE_KEY_VAULT_CLIENT_SECRET
      ) {
        throw new BadRequestError({
          message: `Azure environment variables have not been configured`
        });
      }

      const oauthCredentials = (await decryptAppConnectionCredentials({
        orgId: appConnection.orgId,
        kmsService,
        encryptedCredentials: appConnection.encryptedCredentials
      })) as TAzureKeyVaultConnectionCredentials;

      const { data } = await request.post<ExchangeCodeAzureResponse>(
        IntegrationUrls.AZURE_TOKEN_URL.replace("common", oauthCredentials.tenantId || "common"),
        new URLSearchParams({
          grant_type: "refresh_token",
          scope: `openid offline_access https://vault.azure.net/.default`,
          client_id: appCfg.INF_APP_CONNECTION_AZURE_KEY_VAULT_CLIENT_ID,
          client_secret: appCfg.INF_APP_CONNECTION_AZURE_KEY_VAULT_CLIENT_SECRET,
          refresh_token: oauthCredentials.refreshToken
        })
      );

      const updatedOAuthCredentials = {
        ...oauthCredentials,
        accessToken: data.access_token,
        expiresAt: currentTime + data.expires_in * 1000,
        refreshToken: data.refresh_token
      };

      const encryptedOAuthCredentials = await encryptAppConnectionCredentials({
        credentials: updatedOAuthCredentials,
        orgId: appConnection.orgId,
        kmsService
      });

      await appConnectionDAL.updateById(appConnection.id, { encryptedCredentials: encryptedOAuthCredentials });

      return {
        accessToken: data.access_token
      };

    case AzureKeyVaultConnectionMethod.ClientSecret:
      const clientSecretCredentials = (await decryptAppConnectionCredentials({
        orgId: appConnection.orgId,
        kmsService,
        encryptedCredentials: appConnection.encryptedCredentials
      })) as TAzureKeyVaultConnectionClientSecretCredentials;

      const { accessToken, expiresAt, clientId, clientSecret, tenantId } = clientSecretCredentials;

      // Check if token is still valid (with 5 minute buffer)
      if (accessToken && expiresAt && expiresAt > currentTime + 300000) {
        return { accessToken };
      }

      const { data: clientData } = await request.post<ExchangeCodeAzureResponse>(
        IntegrationUrls.AZURE_TOKEN_URL.replace("common", tenantId || "common"),
        new URLSearchParams({
          grant_type: "client_credentials",
          scope: `https://vault.azure.net/.default`,
          client_id: clientId,
          client_secret: clientSecret
        })
      );

      const updatedClientCredentials = {
        ...clientSecretCredentials,
        accessToken: clientData.access_token,
        expiresAt: currentTime + clientData.expires_in * 1000
      };

      const encryptedClientCredentials = await encryptAppConnectionCredentials({
        credentials: updatedClientCredentials,
        orgId: appConnection.orgId,
        kmsService
      });

      await appConnectionDAL.updateById(appConnection.id, { encryptedCredentials: encryptedClientCredentials });

      return { accessToken: clientData.access_token };

    default:
      throw new InternalServerError({
        message: `Unhandled Azure Key Vault connection method: ${appConnection.method as AzureKeyVaultConnectionMethod}`
      });
  }
};

export const getAzureKeyVaultConnectionListItem = () => {
  const { INF_APP_CONNECTION_AZURE_KEY_VAULT_CLIENT_ID } = getConfig();

  return {
    name: "Azure Key Vault" as const,
    app: AppConnection.AzureKeyVault as const,
    methods: Object.values(AzureKeyVaultConnectionMethod) as [
      AzureKeyVaultConnectionMethod.OAuth,
      AzureKeyVaultConnectionMethod.ClientSecret
    ],
    oauthClientId: INF_APP_CONNECTION_AZURE_KEY_VAULT_CLIENT_ID
  };
};

export const validateAzureKeyVaultConnectionCredentials = async (config: TAzureKeyVaultConnectionConfig) => {
  const { credentials: inputCredentials, method } = config;

  const { INF_APP_CONNECTION_AZURE_KEY_VAULT_CLIENT_ID, INF_APP_CONNECTION_AZURE_KEY_VAULT_CLIENT_SECRET, SITE_URL } =
    getConfig();

  switch (method) {
    case AzureKeyVaultConnectionMethod.OAuth:
      if (!INF_APP_CONNECTION_AZURE_KEY_VAULT_CLIENT_ID || !INF_APP_CONNECTION_AZURE_KEY_VAULT_CLIENT_SECRET) {
        throw new InternalServerError({
          message: `Azure ${getAppConnectionMethodName(method)} environment variables have not been configured`
        });
      }

      let tokenResp: AxiosResponse<ExchangeCodeAzureResponse> | null = null;
      let tokenError: AxiosError | null = null;
      const oauthCredentials = inputCredentials as { code: string; tenantId?: string };
      try {
        tokenResp = await request.post<ExchangeCodeAzureResponse>(
          IntegrationUrls.AZURE_TOKEN_URL.replace("common", oauthCredentials.tenantId || "common"),
          new URLSearchParams({
            grant_type: "authorization_code",
            code: oauthCredentials.code,
            scope: `openid offline_access https://vault.azure.net/.default`,
            client_id: INF_APP_CONNECTION_AZURE_KEY_VAULT_CLIENT_ID,
            client_secret: INF_APP_CONNECTION_AZURE_KEY_VAULT_CLIENT_SECRET,
            redirect_uri: `${SITE_URL}/organization/app-connections/azure/oauth/callback`
          })
        );
      } catch (e: unknown) {
        if (e instanceof AxiosError) {
          tokenError = e;
        } else {
          throw new BadRequestError({
            message: `Unable to validate connection: verify credentials`
          });
        }
      }

      if (tokenError) {
        if (tokenError instanceof AxiosError) {
          throw new BadRequestError({
            message: `Failed to get access token: ${
              (tokenError?.response?.data as { error_description?: string })?.error_description || "Unknown error"
            }`
          });
        } else {
          throw new InternalServerError({
            message: "Failed to get access token"
          });
        }
      }

      if (!tokenResp) {
        throw new InternalServerError({
          message: `Failed to get access token: Token was empty with no error`
        });
      }

      return {
        tenantId: oauthCredentials.tenantId,
        accessToken: tokenResp.data.access_token,
        refreshToken: tokenResp.data.refresh_token,
        expiresAt: Date.now() + tokenResp.data.expires_in * 1000
      };

    case AzureKeyVaultConnectionMethod.ClientSecret:
      const { tenantId, clientId, clientSecret } = inputCredentials as {
        tenantId: string;
        clientId: string;
        clientSecret: string;
      };

      try {
        const { data: clientData } = await request.post<ExchangeCodeAzureResponse>(
          IntegrationUrls.AZURE_TOKEN_URL.replace("common", tenantId || "common"),
          new URLSearchParams({
            grant_type: "client_credentials",
            scope: `https://vault.azure.net/.default`,
            client_id: clientId,
            client_secret: clientSecret
          })
        );

        return {
          tenantId,
          accessToken: clientData.access_token,
          expiresAt: Date.now() + clientData.expires_in * 1000,
          clientId,
          clientSecret
        };
      } catch (e: unknown) {
        if (e instanceof AxiosError) {
          throw new BadRequestError({
            message: `Failed to get access token: ${
              (e?.response?.data as { error_description?: string })?.error_description || "Unknown error"
            }`
          });
        } else {
          throw new InternalServerError({
            message: "Failed to get access token"
          });
        }
      }

    default:
      throw new InternalServerError({
        message: `Unhandled Azure Key Vault connection method: ${method as AzureKeyVaultConnectionMethod}`
      });
  }
};
