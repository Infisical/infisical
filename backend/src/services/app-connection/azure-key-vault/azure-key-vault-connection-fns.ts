/* eslint-disable no-case-declarations */
import { AxiosError, AxiosRequestConfig, AxiosResponse } from "axios";
import https from "https";

import { verifyHostInputValidity } from "@app/ee/services/dynamic-secret/dynamic-secret-fns";
import { TGatewayServiceFactory } from "@app/ee/services/gateway/gateway-service";
import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { getConfig } from "@app/lib/config/env";
import { request } from "@app/lib/config/request";
import { BadRequestError, InternalServerError, NotFoundError } from "@app/lib/errors";
import { GatewayProxyProtocol, withGatewayProxy } from "@app/lib/gateway";
import { withGatewayV2Proxy } from "@app/lib/gateway-v2/gateway-v2";
import { logger } from "@app/lib/logger";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";
import {
  decryptAppConnectionCredentials,
  encryptAppConnectionCredentials,
  getAppConnectionMethodName
} from "@app/services/app-connection/app-connection-fns";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

import { TAppConnectionDALFactory } from "../app-connection-dal";
import { AppConnection } from "../app-connection-enums";
import { generateClientAssertion } from "../shared/azure/generate-client-assertion";
import { AzureKeyVaultConnectionMethod } from "./azure-key-vault-connection-enums";
import {
  ExchangeCodeAzureResponse,
  TAzureKeyVaultConnectionCertificateCredentials,
  TAzureKeyVaultConnectionClientSecretCredentials,
  TAzureKeyVaultConnectionConfig,
  TAzureKeyVaultConnectionCredentials
} from "./azure-key-vault-connection-types";

/**
 * Proxies an Azure Key Vault data-plane request through a gateway when the connection has one
 * configured, otherwise sends it directly. Mirrors `requestWithHCVaultGateway`.
 *
 * Note: this is only for vault data-plane calls (e.g. https://<vault>.vault.azure.net), which can
 * sit behind an Azure Private Link. Azure AD token requests (login.microsoftonline.com) are public
 * and are not routed through the gateway.
 */
export const requestWithAzureKeyVaultGateway = async <T>(
  connection: { gatewayId?: string | null; gatewayPoolId?: string | null },
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">,
  requestConfig: AxiosRequestConfig,
  gatewayPoolService?: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">
): Promise<AxiosResponse<T>> => {
  const { gatewayId: directGatewayId, gatewayPoolId } = connection;

  if (gatewayPoolId && !gatewayPoolService) {
    throw new BadRequestError({
      message: "Pool-backed connections require gatewayPoolService at the call site"
    });
  }

  const gatewayId =
    gatewayPoolId && gatewayPoolService
      ? await gatewayPoolService.resolveEffectiveGatewayId({ gatewayId: directGatewayId, gatewayPoolId })
      : directGatewayId;

  const url = new URL(requestConfig.url as string);
  await blockLocalAndPrivateIpAddresses(url.toString(), Boolean(gatewayId));

  // If gateway isn't set up, don't proxy the request
  if (!gatewayId) {
    return request.request(requestConfig);
  }

  const [targetHost] = await verifyHostInputValidity({ host: url.hostname, isGateway: true, isDynamicSecret: false });
  // port is empty string when using the protocol's default port (443 for https, 80 for http)
  // eslint-disable-next-line no-nested-ternary
  const targetPort = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;

  // try gateway v2 first, then fall back to gateway v1
  const gatewayConnectionDetailsV2 = await gatewayV2Service.getPlatformConnectionDetailsByGatewayId({
    gatewayId,
    targetHost,
    targetPort
  });

  if (gatewayConnectionDetailsV2) {
    return withGatewayV2Proxy(
      async (proxyPort) => {
        const isHttps = url.protocol === "https:";

        url.host = `localhost:${proxyPort}`;

        const finalRequestConfig: AxiosRequestConfig = {
          ...requestConfig,
          url: url.toString(),
          headers: {
            ...requestConfig.headers,
            Host: targetHost
          },
          ...(isHttps && {
            httpsAgent: new https.Agent({
              servername: targetHost
            })
          })
        };

        try {
          return await request.request(finalRequestConfig);
        } catch (error) {
          if (error instanceof AxiosError) {
            logger.error(
              {
                error,
                message: error.message,
                data: (error.response as undefined | { data: unknown })?.data,
                url: url.toString()
              },
              "Error during Azure Key Vault gateway v2 request:"
            );
          }
          throw error;
        }
      },
      {
        protocol: GatewayProxyProtocol.Tcp,
        relayHost: gatewayConnectionDetailsV2.relayHost,
        gateway: gatewayConnectionDetailsV2.gateway,
        relay: gatewayConnectionDetailsV2.relay
      }
    );
  }

  const gatewayConnectionDetailsV1 = await gatewayService.fnGetGatewayClientTlsByGatewayId(gatewayId);

  return withGatewayProxy(
    async (proxyPort) => {
      const isHttps = url.protocol === "https:";

      url.host = `localhost:${proxyPort}`;

      const finalRequestConfig: AxiosRequestConfig = {
        ...requestConfig,
        url: url.toString(),
        headers: {
          ...requestConfig.headers,
          Host: targetHost
        },
        ...(isHttps && {
          httpsAgent: new https.Agent({
            servername: targetHost
          })
        })
      };

      try {
        return await request.request(finalRequestConfig);
      } catch (error) {
        if (error instanceof AxiosError) {
          logger.error(
            {
              error,
              message: error.message,
              data: (error.response as undefined | { data: unknown })?.data,
              url: url.toString()
            },
            "Error during Azure Key Vault gateway v1 request:"
          );
        }
        throw error;
      }
    },
    {
      relayDetails: gatewayConnectionDetailsV1,
      protocol: GatewayProxyProtocol.Tcp,
      targetHost,
      targetPort
    }
  );
};

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
        encryptedCredentials: appConnection.encryptedCredentials,
        projectId: appConnection.projectId
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
        kmsService,
        projectId: appConnection.projectId
      });

      await appConnectionDAL.updateById(appConnection.id, { encryptedCredentials: encryptedOAuthCredentials });

      return {
        accessToken: data.access_token
      };

    case AzureKeyVaultConnectionMethod.ClientSecret:
      const clientSecretCredentials = (await decryptAppConnectionCredentials({
        orgId: appConnection.orgId,
        kmsService,
        encryptedCredentials: appConnection.encryptedCredentials,
        projectId: appConnection.projectId
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
        kmsService,
        projectId: appConnection.projectId
      });

      await appConnectionDAL.updateById(appConnection.id, { encryptedCredentials: encryptedClientCredentials });

      return { accessToken: clientData.access_token };

    case AzureKeyVaultConnectionMethod.Certificate:
      const certificateCredentials = (await decryptAppConnectionCredentials({
        orgId: appConnection.orgId,
        kmsService,
        encryptedCredentials: appConnection.encryptedCredentials,
        projectId: appConnection.projectId
      })) as TAzureKeyVaultConnectionCertificateCredentials;

      const {
        accessToken: certAccessToken,
        expiresAt: certExpiresAt,
        clientId: certClientId,
        tenantId: certTenantId,
        certificateBody,
        privateKey
      } = certificateCredentials;

      // Check if token is still valid (with 5 minute buffer)
      if (certAccessToken && certExpiresAt && certExpiresAt > currentTime + 300000) {
        return { accessToken: certAccessToken };
      }

      const certificateClientAssertion = generateClientAssertion(
        certClientId,
        certTenantId,
        privateKey,
        certificateBody
      );

      const { data: certificateData } = await request.post<ExchangeCodeAzureResponse>(
        IntegrationUrls.AZURE_TOKEN_URL.replace("common", certTenantId || "common"),
        new URLSearchParams({
          grant_type: "client_credentials",
          scope: `https://vault.azure.net/.default`,
          client_id: certClientId,
          client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
          client_assertion: certificateClientAssertion
        })
      );

      const updatedCertificateCredentials = {
        ...certificateCredentials,
        accessToken: certificateData.access_token,
        expiresAt: currentTime + certificateData.expires_in * 1000
      };

      const encryptedCertificateCredentials = await encryptAppConnectionCredentials({
        credentials: updatedCertificateCredentials,
        orgId: appConnection.orgId,
        kmsService,
        projectId: appConnection.projectId
      });

      await appConnectionDAL.updateById(appConnection.id, {
        encryptedCredentials: encryptedCertificateCredentials
      });

      return { accessToken: certificateData.access_token };

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
      AzureKeyVaultConnectionMethod.ClientSecret,
      AzureKeyVaultConnectionMethod.Certificate
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
            message: "Unable to validate connection: verify credentials"
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

    case AzureKeyVaultConnectionMethod.Certificate:
      const {
        tenantId: certTenantId,
        certificateBody,
        privateKey,
        clientId: certClientId
      } = inputCredentials as {
        tenantId: string;
        certificateBody: string;
        privateKey: string;
        clientId: string;
      };

      try {
        const clientAssertion = generateClientAssertion(certClientId, certTenantId, privateKey, certificateBody);

        const { data: certificateData } = await request.post<ExchangeCodeAzureResponse>(
          IntegrationUrls.AZURE_TOKEN_URL.replace("common", certTenantId || "common"),
          new URLSearchParams({
            grant_type: "client_credentials",
            scope: `https://vault.azure.net/.default`,
            client_id: certClientId,
            client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
            client_assertion: clientAssertion
          })
        );

        return {
          tenantId: certTenantId,
          clientId: certClientId,
          certificateBody,
          privateKey,
          accessToken: certificateData.access_token,
          expiresAt: Date.now() + certificateData.expires_in * 1000
        };
      } catch (e: unknown) {
        if (e instanceof AxiosError) {
          throw new BadRequestError({
            message: `Failed to get access token: ${
              (e?.response?.data as { error_description?: string })?.error_description || "Unknown error"
            }`
          });
        } else if (e instanceof BadRequestError) {
          throw e;
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
