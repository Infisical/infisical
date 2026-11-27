import { AxiosError } from "axios";

import { TKmsDataKeyService } from "@app/domains/platform/kms-core/ce/module";
import { request } from "@app/lib/config/request";
import { BadRequestError, InternalServerError, NotFoundError } from "@app/lib/errors";
import {
  decryptAppConnectionCredentials,
  encryptAppConnectionCredentials
} from "@app/services/app-connection/app-connection-fns";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";
import { TOidcIssuerServiceFactory } from "@app/services/oidc-issuer/oidc-issuer-service";

import { TAppConnectionDALFactory } from "../app-connection-dal";
import { AppConnection } from "../app-connection-enums";
import {
  getAzureManagedIdentityAccessToken,
  getCachedAzureManagedIdentityAccessToken,
  isAzureAccessTokenValid
} from "../shared/azure/azure-managed-identity-fns";
import { AzureEntraIdConnectionMethod } from "./azure-entra-id-connection-enums";
import {
  ExchangeCodeAzureResponse,
  TAzureEntraIdConnectionClientSecretCredentials,
  TAzureEntraIdConnectionConfig
} from "./azure-entra-id-connection-types";

export const getAzureEntraIdConnectionAccessToken = async (
  connectionId: string,
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById" | "updateById">,
  kmsDataKeyService: TKmsDataKeyService,
  oidcIssuerService: Pick<TOidcIssuerServiceFactory, "signToken">
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
        kmsDataKeyService,
        encryptedCredentials: appConnection.encryptedCredentials,
        projectId: appConnection.projectId
      })) as TAzureEntraIdConnectionClientSecretCredentials;

      const { accessToken, expiresAt, clientId, clientSecret, tenantId } = clientSecretCredentials;

      if (isAzureAccessTokenValid({ accessToken, expiresAt })) {
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
        kmsDataKeyService,
        projectId: appConnection.projectId
      });

      await appConnectionDAL.updateById(appConnection.id, { encryptedCredentials: encryptedClientCredentials });

      return clientData.access_token;
    }
    case AzureEntraIdConnectionMethod.ManagedIdentity:
      return getCachedAzureManagedIdentityAccessToken(
        { appConnection, scope: "https://graph.microsoft.com/.default" },
        { appConnectionDAL, kmsDataKeyService, oidcIssuerService }
      );
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
    methods: Object.values(AzureEntraIdConnectionMethod) as [
      AzureEntraIdConnectionMethod.ClientSecret,
      AzureEntraIdConnectionMethod.ManagedIdentity
    ]
  };
};

export const graphApiRequest = async <T>(
  url: string,
  headers: Record<string, string>,
  description: string
): Promise<T> => {
  try {
    const { data } = await request.get<T>(url, { headers });
    return data;
  } catch (err: unknown) {
    if (err instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to ${description}: ${
          (err.response?.data as { error?: { message?: string } })?.error?.message || err.message
        }`
      });
    }
    throw new BadRequestError({
      message: `Failed to ${description}`
    });
  }
};

export const validateAzureEntraIdConnectionCredentials = async (
  config: TAzureEntraIdConnectionConfig,
  oidcIssuerService: Pick<TOidcIssuerServiceFactory, "signToken">
) => {
  const { credentials: inputCredentials, method, orgId, projectId, connection } = config;

  switch (method) {
    case AzureEntraIdConnectionMethod.ClientSecret: {
      const { tenantId, clientId, clientSecret, clientSecretKeyId } = inputCredentials as {
        tenantId: string;
        clientId: string;
        clientSecret: string;
        clientSecretKeyId?: string;
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
          clientSecret,
          clientSecretKeyId
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
    case AzureEntraIdConnectionMethod.ManagedIdentity: {
      const { tenantId, clientId } = inputCredentials as { tenantId: string; clientId: string };

      // A new connection has no ID yet, so Azure cannot trust its subject. Verifying it after create runs the
      // exchange once the customer has added the federated credential.
      if (!connection) return { tenantId, clientId };

      try {
        const managedIdentityToken = await getAzureManagedIdentityAccessToken(
          {
            appConnection: { ...connection, orgId, projectId },
            tenantId,
            clientId,
            scope: "https://graph.microsoft.com/.default"
          },
          oidcIssuerService
        );

        return { tenantId, clientId, ...managedIdentityToken };
      } catch (e: unknown) {
        if (e instanceof AxiosError) {
          throw new BadRequestError({
            message: `Failed to get access token: ${
              (e?.response?.data as { error_description?: string })?.error_description || "Unknown error"
            }`
          });
        }
        throw e;
      }
    }
    default:
      throw new InternalServerError({
        message: `Unhandled Azure Entra ID connection method: ${method as AzureEntraIdConnectionMethod}`
      });
  }
};
