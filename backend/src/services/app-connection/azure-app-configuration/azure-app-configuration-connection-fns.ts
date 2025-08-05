/* eslint-disable no-case-declarations */
import { AxiosError, AxiosResponse } from "axios";

import { getConfig } from "@app/lib/config/env";
import { request } from "@app/lib/config/request";
import { BadRequestError, InternalServerError } from "@app/lib/errors";
import { getAppConnectionMethodName } from "@app/services/app-connection/app-connection-fns";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";

import { AppConnection } from "../app-connection-enums";
import { AzureAppConfigurationConnectionMethod } from "./azure-app-configuration-connection-enums";
import {
  ExchangeCodeAzureResponse,
  TAzureAppConfigurationConnectionConfig
} from "./azure-app-configuration-connection-types";

export const getAzureAppConfigurationConnectionListItem = () => {
  const { INF_APP_CONNECTION_AZURE_APP_CONFIGURATION_CLIENT_ID } = getConfig();

  return {
    name: "Azure App Configuration" as const,
    app: AppConnection.AzureAppConfiguration as const,
    methods: Object.values(AzureAppConfigurationConnectionMethod) as [
      AzureAppConfigurationConnectionMethod.OAuth,
      AzureAppConfigurationConnectionMethod.ClientSecret
    ],
    oauthClientId: INF_APP_CONNECTION_AZURE_APP_CONFIGURATION_CLIENT_ID
  };
};

export const validateAzureAppConfigurationConnectionCredentials = async (
  config: TAzureAppConfigurationConnectionConfig
) => {
  const { credentials: inputCredentials, method } = config;

  const {
    INF_APP_CONNECTION_AZURE_APP_CONFIGURATION_CLIENT_ID,
    INF_APP_CONNECTION_AZURE_APP_CONFIGURATION_CLIENT_SECRET,
    SITE_URL
  } = getConfig();

  switch (method) {
    case AzureAppConfigurationConnectionMethod.OAuth:
      if (
        !INF_APP_CONNECTION_AZURE_APP_CONFIGURATION_CLIENT_ID ||
        !INF_APP_CONNECTION_AZURE_APP_CONFIGURATION_CLIENT_SECRET
      ) {
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
            scope: `openid offline_access https://azconfig.io/.default`,
            client_id: INF_APP_CONNECTION_AZURE_APP_CONFIGURATION_CLIENT_ID,
            client_secret: INF_APP_CONNECTION_AZURE_APP_CONFIGURATION_CLIENT_SECRET,
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

    case AzureAppConfigurationConnectionMethod.ClientSecret:
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
            scope: `https://azconfig.io/.default`,
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
        message: `Unhandled Azure App Configuration connection method: ${method as AzureAppConfigurationConnectionMethod}`
      });
  }
};
