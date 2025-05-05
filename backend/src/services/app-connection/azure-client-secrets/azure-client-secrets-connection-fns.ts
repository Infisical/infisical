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
import { AzureClientSecretsConnectionMethod } from "./azure-client-secrets-connection-enums";
import {
  ExchangeCodeAzureResponse,
  TAzureClientSecretsConnectionConfig,
  TAzureClientSecretsConnectionCredentials
} from "./azure-client-secrets-connection-types";

export const getAzureClientSecretsConnectionListItem = () => {
  const { INF_APP_CONNECTION_AZURE_CLIENT_ID } = getConfig();

  return {
    name: "Azure Client Secrets" as const,
    app: AppConnection.AzureClientSecrets as const,
    methods: Object.values(AzureClientSecretsConnectionMethod) as [AzureClientSecretsConnectionMethod.OAuth],
    oauthClientId: INF_APP_CONNECTION_AZURE_CLIENT_ID
  };
};

export const getAzureConnectionAccessToken = async (
  connectionId: string,
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById" | "updateById">,
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">
) => {
  const appCfg = getConfig();
  if (!appCfg.INF_APP_CONNECTION_AZURE_CLIENT_ID || !appCfg.INF_APP_CONNECTION_AZURE_CLIENT_SECRET) {
    throw new BadRequestError({
      message: `Azure environment variables have not been configured`
    });
  }

  const appConnection = await appConnectionDAL.findById(connectionId);

  if (!appConnection) {
    throw new NotFoundError({ message: `Connection with ID '${connectionId}' not found` });
  }

  if (appConnection.app !== AppConnection.AzureClientSecrets) {
    throw new BadRequestError({
      message: `Connection with ID '${connectionId}' is not an Azure Client Secrets connection`
    });
  }

  const credentials = (await decryptAppConnectionCredentials({
    orgId: appConnection.orgId,
    kmsService,
    encryptedCredentials: appConnection.encryptedCredentials
  })) as TAzureClientSecretsConnectionCredentials;

  const { refreshToken } = credentials;
  const currentTime = Date.now();

  const { data } = await request.post<ExchangeCodeAzureResponse>(
    IntegrationUrls.AZURE_TOKEN_URL.replace("common", credentials.tenantId || "common"),
    new URLSearchParams({
      grant_type: "refresh_token",
      scope: `openid offline_access https://graph.microsoft.com/.default`,
      client_id: appCfg.INF_APP_CONNECTION_AZURE_CLIENT_ID,
      client_secret: appCfg.INF_APP_CONNECTION_AZURE_CLIENT_SECRET,
      refresh_token: refreshToken
    })
  );

  const updatedCredentials = {
    ...credentials,
    accessToken: data.access_token,
    expiresAt: currentTime + data.expires_in * 1000,
    refreshToken: data.refresh_token
  };

  const encryptedCredentials = await encryptAppConnectionCredentials({
    credentials: updatedCredentials,
    orgId: appConnection.orgId,
    kmsService
  });

  await appConnectionDAL.updateById(appConnection.id, { encryptedCredentials });

  return data.access_token;
};

export const validateAzureClientSecretsConnectionCredentials = async (config: TAzureClientSecretsConnectionConfig) => {
  const { credentials: inputCredentials, method } = config;

  const { INF_APP_CONNECTION_AZURE_CLIENT_ID, INF_APP_CONNECTION_AZURE_CLIENT_SECRET, SITE_URL } = getConfig();

  if (!SITE_URL) {
    throw new InternalServerError({ message: "SITE_URL env var is required to complete Azure OAuth flow" });
  }

  if (!INF_APP_CONNECTION_AZURE_CLIENT_ID || !INF_APP_CONNECTION_AZURE_CLIENT_SECRET) {
    throw new InternalServerError({
      message: `Azure ${getAppConnectionMethodName(method)} environment variables have not been configured`
    });
  }

  let tokenResp: AxiosResponse<ExchangeCodeAzureResponse> | null = null;
  let tokenError: AxiosError | null = null;

  try {
    tokenResp = await request.post<ExchangeCodeAzureResponse>(
      IntegrationUrls.AZURE_TOKEN_URL.replace("common", inputCredentials.tenantId || "common"),
      new URLSearchParams({
        grant_type: "authorization_code",
        code: inputCredentials.code,
        scope: `openid offline_access https://graph.microsoft.com/.default`,
        client_id: INF_APP_CONNECTION_AZURE_CLIENT_ID,
        client_secret: INF_APP_CONNECTION_AZURE_CLIENT_SECRET,
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

  switch (method) {
    case AzureClientSecretsConnectionMethod.OAuth:
      return {
        tenantId: inputCredentials.tenantId,
        accessToken: tokenResp.data.access_token,
        refreshToken: tokenResp.data.refresh_token,
        expiresAt: Date.now() + tokenResp.data.expires_in * 1000
      };
    default:
      throw new InternalServerError({
        message: `Unhandled Azure connection method: ${method as AzureClientSecretsConnectionMethod}`
      });
  }
};
