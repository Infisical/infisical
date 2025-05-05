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
  TAzureKeyVaultConnectionConfig,
  TAzureKeyVaultConnectionCredentials
} from "./azure-key-vault-connection-types";

export const getAzureConnectionAccessToken = async (
  connectionId: string,
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById" | "update">,
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

  if (
    appConnection.app !== AppConnection.AzureKeyVault &&
    appConnection.app !== AppConnection.AzureAppConfiguration &&
    appConnection.app !== AppConnection.AzureClientSecrets
  ) {
    throw new BadRequestError({ message: `Connection with ID '${connectionId}' is not a valid Azure connection` });
  }

  const credentials = (await decryptAppConnectionCredentials({
    orgId: appConnection.orgId,
    kmsService,
    encryptedCredentials: appConnection.encryptedCredentials
  })) as TAzureKeyVaultConnectionCredentials;

  const { data } = await request.post<ExchangeCodeAzureResponse>(
    IntegrationUrls.AZURE_TOKEN_URL.replace("common", credentials.tenantId || "common"),
    new URLSearchParams({
      grant_type: "refresh_token",
      scope: `openid offline_access`,
      client_id: appCfg.INF_APP_CONNECTION_AZURE_CLIENT_ID,
      client_secret: appCfg.INF_APP_CONNECTION_AZURE_CLIENT_SECRET,
      refresh_token: credentials.refreshToken
    })
  );

  const accessExpiresAt = new Date();
  accessExpiresAt.setSeconds(accessExpiresAt.getSeconds() + data.expires_in);

  const updatedCredentials = {
    ...credentials,
    accessToken: data.access_token,
    expiresAt: accessExpiresAt.getTime(),
    refreshToken: data.refresh_token
  };

  const encryptedCredentials = await encryptAppConnectionCredentials({
    credentials: updatedCredentials,
    orgId: appConnection.orgId,
    kmsService
  });

  await appConnectionDAL.update(
    { id: connectionId },
    {
      encryptedCredentials
    }
  );

  return {
    accessToken: data.access_token
  };
};

export const getAzureKeyVaultConnectionListItem = () => {
  const { INF_APP_CONNECTION_AZURE_CLIENT_ID } = getConfig();

  return {
    name: "Azure Key Vault" as const,
    app: AppConnection.AzureKeyVault as const,
    methods: Object.values(AzureKeyVaultConnectionMethod) as [AzureKeyVaultConnectionMethod.OAuth],
    oauthClientId: INF_APP_CONNECTION_AZURE_CLIENT_ID
  };
};

export const validateAzureKeyVaultConnectionCredentials = async (config: TAzureKeyVaultConnectionConfig) => {
  const { credentials: inputCredentials, method } = config;

  const { INF_APP_CONNECTION_AZURE_CLIENT_ID, INF_APP_CONNECTION_AZURE_CLIENT_SECRET, SITE_URL } = getConfig();

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
        scope: `openid offline_access https://vault.azure.net/.default`,
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
    case AzureKeyVaultConnectionMethod.OAuth:
      return {
        tenantId: inputCredentials.tenantId,
        accessToken: tokenResp.data.access_token,
        refreshToken: tokenResp.data.refresh_token,
        expiresAt: Date.now() + tokenResp.data.expires_in * 1000
      };
    default:
      throw new InternalServerError({
        message: `Unhandled Azure connection method: ${method as AzureKeyVaultConnectionMethod}`
      });
  }
};
