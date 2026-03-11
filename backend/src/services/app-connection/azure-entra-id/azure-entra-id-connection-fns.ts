import { AxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { BadRequestError, InternalServerError, NotFoundError } from "@app/lib/errors";
import {
  decryptAppConnectionCredentials,
  encryptAppConnectionCredentials
} from "@app/services/app-connection/app-connection-fns";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

import { TAppConnectionDALFactory } from "../app-connection-dal";
import { AppConnection } from "../app-connection-enums";
import { AzureEntraIdConnectionMethod } from "./azure-entra-id-connection-enums";
import {
  ExchangeCodeAzureResponse,
  TAzureEntraIdConnectionClientSecretCredentials,
  TAzureEntraIdConnectionConfig
} from "./azure-entra-id-connection-types";

export const getAzureEntraIdConnectionAccessToken = async (
  connectionId: string,
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById" | "updateById">,
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">
) => {
  const appConnection = await appConnectionDAL.findById(connectionId);

  if (!appConnection) {
    throw new NotFoundError({ message: `Connection with ID '${connectionId}' not found` });
  }

  if (appConnection.app !== AppConnection.AzureEntraId) {
    throw new BadRequestError({
      message: `Connection with ID '${connectionId}' is not an Azure Entra ID connection`
    });
  }

  const currentTime = Date.now();

  switch (appConnection.method) {
    case AzureEntraIdConnectionMethod.ClientSecret: {
      const clientSecretCredentials = (await decryptAppConnectionCredentials({
        orgId: appConnection.orgId,
        kmsService,
        encryptedCredentials: appConnection.encryptedCredentials,
        projectId: appConnection.projectId
      })) as TAzureEntraIdConnectionClientSecretCredentials;

      const { accessToken, expiresAt, clientId, clientSecret, tenantId } = clientSecretCredentials;

      // Check if token is still valid (with 5 minute buffer)
      if (accessToken && expiresAt && expiresAt > currentTime + 300000) {
        return accessToken;
      }

      const { data: clientData } = await request.post<ExchangeCodeAzureResponse>(
        IntegrationUrls.AZURE_TOKEN_URL.replace("common", tenantId || "common"),
        new URLSearchParams({
          grant_type: "client_credentials",
          scope: `https://graph.microsoft.com/.default`,
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
        kmsService,
        projectId: appConnection.projectId
      });

      await appConnectionDAL.updateById(appConnection.id, { encryptedCredentials: encryptedClientCredentials });

      return clientData.access_token;
    }
    default:
      throw new InternalServerError({
        message: `Unhandled Azure Entra ID connection method: ${appConnection.method as AzureEntraIdConnectionMethod}`
      });
  }
};

export const getAzureEntraIdConnectionListItem = () => {
  return {
    name: "Azure Entra ID" as const,
    app: AppConnection.AzureEntraId as const,
    methods: Object.values(AzureEntraIdConnectionMethod) as [AzureEntraIdConnectionMethod.ClientSecret]
  };
};

export const validateAzureEntraIdConnectionCredentials = async (config: TAzureEntraIdConnectionConfig) => {
  const { credentials: inputCredentials, method } = config;

  switch (method) {
    case AzureEntraIdConnectionMethod.ClientSecret: {
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
            scope: `https://graph.microsoft.com/.default`,
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
    }
    default:
      throw new InternalServerError({
        message: `Unhandled Azure Entra ID connection method: ${method as AzureEntraIdConnectionMethod}`
      });
  }
};
