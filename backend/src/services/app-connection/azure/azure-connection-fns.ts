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
import { AzureConnectionMethod, AzureResources } from "./azure-connection-enums";
import { TAzureConnectionConfig, TAzureConnectionCredentials } from "./azure-connection-types";

const resourceScopes: Record<AzureResources, string> = {
  [AzureResources.AppConfiguration]: "https://azconfig.io/.default",
  [AzureResources.KeyVault]: "https://vault.azure.net/.default"
};

export const getAzureConnectionAccessToken = async (
  connectionId: string,
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById" | "update">,
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">
) => {
  const appCfg = getConfig();

  const appConnection = await appConnectionDAL.findById(connectionId);

  if (!appConnection) {
    throw new NotFoundError({ message: `Connection with ID '${connectionId}' not found` });
  }

  if (appConnection.app !== AppConnection.Azure) {
    throw new BadRequestError({ message: `Connection with ID '${connectionId}' is not an Azure connection` });
  }

  const credentials = (await decryptAppConnectionCredentials({
    orgId: appConnection.orgId,
    kmsService,
    encryptedCredentials: appConnection.encryptedCredentials
  })) as TAzureConnectionCredentials;

  const { data } = await request.post<ExchangeCodeAzureResponse>(
    IntegrationUrls.AZURE_TOKEN_URL.replace("common", credentials.tenantId || "common"),
    new URLSearchParams({
      grant_type: "refresh_token",
      scope: `openid offline_access`,
      client_id: appCfg.CLIENT_ID_AZURE!,
      client_secret: appCfg.CLIENT_SECRET_AZURE!,
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

export const getAzureConnectionListItem = () => {
  const { CLIENT_ID_AZURE } = getConfig();

  return {
    name: "Azure" as const,
    app: AppConnection.Azure as const,
    methods: Object.values(AzureConnectionMethod) as [AzureConnectionMethod.OAuth],
    oauthClientId: CLIENT_ID_AZURE
  };
};

type ExchangeCodeAzureResponse = {
  token_type: string;
  scope: string;
  expires_in: number;
  ext_expires_in: number;
  access_token: string;
  refresh_token: string;
  id_token: string;
};

export const validateAzureConnectionCredentials = async (config: TAzureConnectionConfig) => {
  const { credentials: inputCredentials, method } = config;

  const { CLIENT_ID_AZURE, CLIENT_SECRET_AZURE } = getConfig();

  if (!CLIENT_ID_AZURE || !CLIENT_SECRET_AZURE) {
    throw new InternalServerError({
      message: `Azure ${getAppConnectionMethodName(method)} environment variables have not been configured`
    });
  }

  let tokenResp: AxiosResponse<ExchangeCodeAzureResponse> | null = null;
  let tokenError: AxiosError | null = null;

  try {
    const appCfg = getConfig();
    if (!appCfg.CLIENT_ID_AZURE || !appCfg.CLIENT_SECRET_AZURE) {
      throw new BadRequestError({ message: "Missing client id and client secret" });
    }

    tokenResp = await request.post<ExchangeCodeAzureResponse>(
      IntegrationUrls.AZURE_TOKEN_URL.replace("common", inputCredentials.tenantId || "common"),
      new URLSearchParams({
        grant_type: "authorization_code",
        code: inputCredentials.code,
        scope: `openid offline_access ${resourceScopes[inputCredentials.resource]}`,
        client_id: appCfg.CLIENT_ID_AZURE,
        client_secret: appCfg.CLIENT_SECRET_AZURE,
        redirect_uri: `${appCfg.SITE_URL}/organization/app-connections/azure/oauth/callback`
      })
    );
    // TODO(daniel): handle token refreshing
  } catch (e: unknown) {
    if (e instanceof AxiosError) {
      tokenError = e;
    } else {
      throw new BadRequestError({
        message: `Unable to validate connection - verify credentials`
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
    case AzureConnectionMethod.OAuth:
      return {
        accessToken: tokenResp.data.access_token,
        refreshToken: tokenResp.data.refresh_token,
        expiresAt: Date.now() + tokenResp.data.expires_in * 1000,
        resource: inputCredentials.resource
      };
    default:
      throw new InternalServerError({
        message: `Unhandled Azure connection method: ${method as AzureConnectionMethod}`
      });
  }
};
