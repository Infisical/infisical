/* eslint-disable no-case-declarations */
import { AxiosError, AxiosResponse } from "axios";

import { getConfig } from "@app/lib/config/env";
import { request } from "@app/lib/config/request";
import { BadRequestError, InternalServerError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import {
  decryptAppConnectionCredentials,
  encryptAppConnectionCredentials,
  getAppConnectionMethodName
} from "@app/services/app-connection/app-connection-fns";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

import { TAppConnectionDALFactory } from "../app-connection-dal";
import { AppConnection } from "../app-connection-enums";
import { AzureDevOpsConnectionMethod } from "./azure-devops-enums";
import {
  ExchangeCodeAzureResponse,
  TAzureDevOpsConnectionConfig,
  TAzureDevOpsConnectionCredentials
} from "./azure-devops-types";

export const getAzureDevopsConnectionListItem = () => {
  const { INF_APP_CONNECTION_AZURE_DEVOPS_CLIENT_ID } = getConfig();

  return {
    name: "Azure DevOps" as const,
    app: AppConnection.AzureDevOps as const,
    methods: Object.values(AzureDevOpsConnectionMethod) as [
      AzureDevOpsConnectionMethod.OAuth,
      AzureDevOpsConnectionMethod.AccessToken
    ],
    oauthClientId: INF_APP_CONNECTION_AZURE_DEVOPS_CLIENT_ID
  };
};

export const getAzureDevopsConnection = async (
  connectionId: string,
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById" | "updateById">,
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">
) => {
  const appConnection = await appConnectionDAL.findById(connectionId);

  if (!appConnection) {
    throw new NotFoundError({ message: `Connection with ID '${connectionId}' not found` });
  }

  if (appConnection.app !== AppConnection.AzureDevOps) {
    throw new BadRequestError({
      message: `Connection with ID '${connectionId}' is not an Azure DevOps connection`
    });
  }

  const credentials = (await decryptAppConnectionCredentials({
    orgId: appConnection.orgId,
    kmsService,
    encryptedCredentials: appConnection.encryptedCredentials
  })) as TAzureDevOpsConnectionCredentials;

  // Handle different connection methods
  switch (appConnection.method) {
    case AzureDevOpsConnectionMethod.OAuth:
      const appCfg = getConfig();
      if (!appCfg.INF_APP_CONNECTION_AZURE_DEVOPS_CLIENT_ID || !appCfg.INF_APP_CONNECTION_AZURE_DEVOPS_CLIENT_SECRET) {
        throw new BadRequestError({
          message: `Azure environment variables have not been configured`
        });
      }

      if (!("refreshToken" in credentials)) {
        throw new BadRequestError({ message: "Invalid OAuth credentials" });
      }

      const { refreshToken, tenantId } = credentials;
      const currentTime = Date.now();

      const { data } = await request.post<ExchangeCodeAzureResponse>(
        IntegrationUrls.AZURE_TOKEN_URL.replace("common", tenantId || "common"),
        new URLSearchParams({
          grant_type: "refresh_token",
          scope: `https://app.vssps.visualstudio.com/.default`,
          client_id: appCfg.INF_APP_CONNECTION_AZURE_DEVOPS_CLIENT_ID,
          client_secret: appCfg.INF_APP_CONNECTION_AZURE_DEVOPS_CLIENT_SECRET,
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

    case AzureDevOpsConnectionMethod.AccessToken:
      if (!("accessToken" in credentials)) {
        throw new BadRequestError({ message: "Invalid API token credentials" });
      }
      // For access token, return the basic auth token directly
      return credentials.accessToken;

    default:
      throw new BadRequestError({ message: `Unsupported connection method` });
  }
};

export const validateAzureDevOpsConnectionCredentials = async (config: TAzureDevOpsConnectionConfig) => {
  const { credentials: inputCredentials, method } = config;

  const { INF_APP_CONNECTION_AZURE_DEVOPS_CLIENT_ID, INF_APP_CONNECTION_AZURE_DEVOPS_CLIENT_SECRET, SITE_URL } =
    getConfig();

  switch (method) {
    case AzureDevOpsConnectionMethod.OAuth:
      if (!SITE_URL) {
        throw new InternalServerError({ message: "SITE_URL env var is required to complete Azure OAuth flow" });
      }

      if (!INF_APP_CONNECTION_AZURE_DEVOPS_CLIENT_ID || !INF_APP_CONNECTION_AZURE_DEVOPS_CLIENT_SECRET) {
        throw new InternalServerError({
          message: `Azure ${getAppConnectionMethodName(method)} environment variables have not been configured`
        });
      }

      let tokenResp: AxiosResponse<ExchangeCodeAzureResponse> | null = null;
      let tokenError: AxiosError | null = null;

      try {
        const oauthCredentials = inputCredentials as { code: string; tenantId: string };
        tokenResp = await request.post<ExchangeCodeAzureResponse>(
          IntegrationUrls.AZURE_TOKEN_URL.replace("common", oauthCredentials.tenantId || "common"),
          new URLSearchParams({
            grant_type: "authorization_code",
            code: oauthCredentials.code,
            scope: `https://app.vssps.visualstudio.com/.default`,
            client_id: INF_APP_CONNECTION_AZURE_DEVOPS_CLIENT_ID,
            client_secret: INF_APP_CONNECTION_AZURE_DEVOPS_CLIENT_SECRET,
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

      const oauthCredentials = inputCredentials as { code: string; tenantId: string; orgName: string };
      return {
        tenantId: oauthCredentials.tenantId,
        orgName: oauthCredentials.orgName,
        accessToken: tokenResp.data.access_token,
        refreshToken: tokenResp.data.refresh_token,
        expiresAt: Date.now() + tokenResp.data.expires_in * 1000
      };

    case AzureDevOpsConnectionMethod.AccessToken:
      const accessTokenCredentials = inputCredentials as { accessToken: string; orgName?: string };

      try {
        if (accessTokenCredentials.orgName) {
          // Validate against specific organization
          const response = await request.get(
            `${IntegrationUrls.AZURE_DEVOPS_API_URL}/${encodeURIComponent(accessTokenCredentials.orgName)}/_apis/projects?api-version=7.2-preview.2&$top=1`,
            {
              headers: {
                Authorization: `Basic ${Buffer.from(`:${accessTokenCredentials.accessToken}`).toString("base64")}`
              }
            }
          );

          if (response.status !== 200) {
            throw new BadRequestError({
              message: `Failed to validate connection: ${response.status}`
            });
          }

          return {
            accessToken: accessTokenCredentials.accessToken,
            orgName: accessTokenCredentials.orgName
          };
        }
        // Validate via profile and discover organizations
        const profileResponse = await request.get<{ displayName: string }>(
          `https://app.vssps.visualstudio.com/_apis/profile/profiles/me?api-version=7.1`,
          {
            headers: {
              Authorization: `Basic ${Buffer.from(`:${accessTokenCredentials.accessToken}`).toString("base64")}`
            }
          }
        );

        let organizations: Array<{ accountId: string; accountName: string; accountUri: string }> = [];
        try {
          const orgsResponse = await request.get<{
            value: Array<{ accountId: string; accountName: string; accountUri: string }>;
          }>(`https://app.vssps.visualstudio.com/_apis/accounts?api-version=7.1`, {
            headers: {
              Authorization: `Basic ${Buffer.from(`:${accessTokenCredentials.accessToken}`).toString("base64")}`
            }
          });
          organizations = orgsResponse.data.value || [];
        } catch (orgError) {
          logger.warn(orgError, "Could not fetch organizations automatically:");
        }

        return {
          accessToken: accessTokenCredentials.accessToken,
          userDisplayName: profileResponse.data.displayName,
          organizations: organizations.map((org) => ({
            accountId: org.accountId,
            accountName: org.accountName,
            accountUri: org.accountUri
          }))
        };
      } catch (error) {
        if (error instanceof AxiosError) {
          const errorMessage = accessTokenCredentials.orgName
            ? // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
              `Failed to validate access token for organization '${accessTokenCredentials.orgName}': ${error.response?.data?.message || error.message}`
            : `Invalid Azure DevOps Personal Access Token: ${error.response?.status === 401 ? "Token is invalid or expired" : error.message}`;

          throw new BadRequestError({ message: errorMessage });
        }
        throw new BadRequestError({
          message: `Unable to validate Azure DevOps token`
        });
      }

    default:
      throw new InternalServerError({
        message: `Unhandled Azure connection method: ${method as AzureDevOpsConnectionMethod}`
      });
  }
};
