import { AxiosError, AxiosRequestConfig, AxiosResponse } from "axios";
import https from "https";

import { verifyHostInputValidity } from "@app/ee/services/dynamic-secret/dynamic-secret-fns";
import { TGatewayServiceFactory } from "@app/ee/services/gateway/gateway-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { removeTrailingSlash } from "@app/lib/fn";
import { GatewayProxyProtocol, withGatewayProxy } from "@app/lib/gateway";
import { logger } from "@app/lib/logger";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { HCVaultConnectionMethod } from "./hc-vault-connection-enums";
import { THCVaultConnection, THCVaultConnectionConfig, THCVaultMountResponse } from "./hc-vault-connection-types";

export const getHCVaultInstanceUrl = async (config: THCVaultConnectionConfig) => {
  const instanceUrl = removeTrailingSlash(config.credentials.instanceUrl);

  await blockLocalAndPrivateIpAddresses(instanceUrl);

  return instanceUrl;
};

export const getHCVaultConnectionListItem = () => ({
  name: "HCVault" as const,
  app: AppConnection.HCVault as const,
  methods: Object.values(HCVaultConnectionMethod) as [
    HCVaultConnectionMethod.AccessToken,
    HCVaultConnectionMethod.AppRole
  ]
});

type TokenRespData = {
  auth: {
    client_token: string;
  };
};

export const requestWithHCVaultGateway = async <T>(
  appConnection: { gatewayId?: string | null },
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">,
  requestConfig: AxiosRequestConfig
): Promise<AxiosResponse<T>> => {
  const { gatewayId } = appConnection;

  // If gateway isn't set up, don't proxy request
  if (!gatewayId) {
    return request.request(requestConfig);
  }

  const url = new URL(requestConfig.url as string);

  await blockLocalAndPrivateIpAddresses(url.toString());

  const [targetHost] = await verifyHostInputValidity(url.hostname, true);
  const relayDetails = await gatewayService.fnGetGatewayClientTlsByGatewayId(gatewayId);
  const [relayHost, relayPort] = relayDetails.relayAddress.split(":");

  return withGatewayProxy(
    async (proxyPort) => {
      const httpsAgent = new https.Agent({
        servername: targetHost
      });

      url.protocol = "https:";
      url.host = `localhost:${proxyPort}`;

      const finalRequestConfig: AxiosRequestConfig = {
        ...requestConfig,
        url: url.toString(),
        httpsAgent,
        headers: {
          ...requestConfig.headers,
          Host: targetHost
        }
      };

      try {
        return await request.request(finalRequestConfig);
      } catch (error) {
        if (error instanceof AxiosError) {
          logger.error(
            { message: error.message, data: (error.response as undefined | { data: unknown })?.data },
            "Error during HashiCorp Vault gateway request:"
          );
        }
        throw error;
      }
    },
    {
      protocol: GatewayProxyProtocol.Tcp,
      targetHost,
      targetPort: url.port ? Number(url.port) : 8200, // 8200 is the default port for Vault self-hosted/dedicated
      relayHost,
      relayPort: Number(relayPort),
      identityId: relayDetails.identityId,
      orgId: relayDetails.orgId,
      tlsOptions: {
        ca: relayDetails.certChain,
        cert: relayDetails.certificate,
        key: relayDetails.privateKey.toString()
      }
    }
  );
};

export const getHCVaultAccessToken = async (
  connection: THCVaultConnection,
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">
) => {
  // Return access token directly if not using AppRole method
  if (connection.method !== HCVaultConnectionMethod.AppRole) {
    return connection.credentials.accessToken;
  }

  // Generate temporary token for AppRole method
  try {
    const { instanceUrl, roleId, secretId } = connection.credentials;

    const tokenResp = await requestWithHCVaultGateway<TokenRespData>(connection, gatewayService, {
      url: `${removeTrailingSlash(instanceUrl)}/v1/auth/approle/login`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(connection.credentials.namespace ? { "X-Vault-Namespace": connection.credentials.namespace } : {})
      },
      data: { role_id: roleId, secret_id: secretId }
    });

    if (tokenResp.status !== 200) {
      throw new BadRequestError({
        message: `Unable to validate credentials: Hashicorp Vault responded with a status code of ${tokenResp.status} (${tokenResp.statusText}). Verify credentials and try again.`
      });
    }

    return tokenResp.data.auth.client_token;
  } catch (e: unknown) {
    throw new BadRequestError({
      message: "Unable to validate connection: verify credentials"
    });
  }
};

export const validateHCVaultConnectionCredentials = async (
  connection: THCVaultConnection,
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">
) => {
  const instanceUrl = await getHCVaultInstanceUrl(connection);

  try {
    const accessToken = await getHCVaultAccessToken(connection, gatewayService);

    // Verify token
    await requestWithHCVaultGateway(connection, gatewayService, {
      url: `${instanceUrl}/v1/auth/token/lookup-self`,
      method: "GET",
      headers: { "X-Vault-Token": accessToken }
    });

    return connection.credentials;
  } catch (error: unknown) {
    logger.error(error, "Unable to verify HC Vault connection");

    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to validate credentials: ${error.message || "Unknown error"}`
      });
    }

    if (error instanceof BadRequestError) {
      throw error;
    }

    throw new BadRequestError({
      message: "Unable to validate connection: verify credentials"
    });
  }
};

export const listHCVaultMounts = async (
  connection: THCVaultConnection,
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">
) => {
  const instanceUrl = await getHCVaultInstanceUrl(connection);
  const accessToken = await getHCVaultAccessToken(connection, gatewayService);

  const { data } = await requestWithHCVaultGateway<THCVaultMountResponse>(connection, gatewayService, {
    url: `${instanceUrl}/v1/sys/mounts`,
    method: "GET",
    headers: {
      "X-Vault-Token": accessToken,
      ...(connection.credentials.namespace ? { "X-Vault-Namespace": connection.credentials.namespace } : {})
    }
  });

  const mounts: string[] = [];

  // Filter for "kv" version 2 type only
  Object.entries(data.data).forEach(([path, mount]) => {
    if (mount.type === "kv" && mount.options?.version === "2") {
      mounts.push(path);
    }
  });

  return mounts;
};
