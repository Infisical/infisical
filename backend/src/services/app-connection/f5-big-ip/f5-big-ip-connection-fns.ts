import { AxiosRequestConfig } from "axios";
import https from "https";

import { TGatewayServiceFactory } from "@app/ee/services/gateway/gateway-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { GatewayProxyProtocol } from "@app/lib/gateway";
import { withGatewayV2Proxy } from "@app/lib/gateway-v2/gateway-v2";
import { blockLocalAndPrivateIpAddresses, buildSsrfSafeAgent } from "@app/lib/validator";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { F5BigIpConnectionMethod } from "./f5-big-ip-connection-enums";
import { TF5BigIpConnectionConfig } from "./f5-big-ip-connection-types";

export const F5_BIG_IP_DEFAULT_PORT = 443;
export const F5_BIG_IP_LOGIN_PROVIDER = "tmos";

export const getF5BigIpConnectionListItem = () => {
  return {
    name: "F5 BIG-IP" as const,
    app: AppConnection.F5BigIp as const,
    methods: Object.values(F5BigIpConnectionMethod) as [F5BigIpConnectionMethod.BasicAuth]
  };
};

const requestWithF5BigIpGateway = async <T>(
  config: TF5BigIpConnectionConfig,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">,
  requestConfig: AxiosRequestConfig
): Promise<T> => {
  const { gatewayId, credentials } = config;
  const { hostname, port: credPort } = credentials;
  const port = credPort ?? F5_BIG_IP_DEFAULT_PORT;

  if (gatewayId && gatewayV2Service) {
    await blockLocalAndPrivateIpAddresses(`https://${hostname}`, true);

    const platformConnectionDetails = await gatewayV2Service.getPlatformConnectionDetailsByGatewayId({
      gatewayId,
      targetHost: hostname,
      targetPort: port
    });

    if (!platformConnectionDetails) {
      throw new BadRequestError({ message: "Unable to connect to gateway, no platform connection details found" });
    }

    return withGatewayV2Proxy(
      async (proxyPort) => {
        const httpsAgent = new https.Agent({
          servername: hostname,
          rejectUnauthorized: credentials.sslRejectUnauthorized,
          ca: credentials.sslCertificate ? [credentials.sslCertificate] : undefined
        });

        const proxyUrl = `https://localhost:${proxyPort}`;
        const finalRequestConfig: AxiosRequestConfig = {
          ...requestConfig,
          url: requestConfig.url?.replace(`https://${hostname}:${port}`, proxyUrl),
          headers: {
            ...requestConfig.headers,
            Host: hostname
          },
          httpsAgent,
          maxRedirects: 0
        };

        const resp = await request.request<T>(finalRequestConfig);
        return resp.data;
      },
      {
        protocol: GatewayProxyProtocol.Tcp,
        relayHost: platformConnectionDetails.relayHost,
        gateway: platformConnectionDetails.gateway,
        relay: platformConnectionDetails.relay
      }
    );
  }

  const httpsAgent = await buildSsrfSafeAgent(`https://${hostname}:${port}`, {
    ca: credentials.sslCertificate,
    rejectUnauthorized: credentials.sslRejectUnauthorized,
    servername: hostname
  });
  const resp = await request.request<T>({
    ...requestConfig,
    httpsAgent,
    maxRedirects: 0
  });
  return resp.data;
};

type TF5BigIpLoginResponse = {
  token?: {
    token?: string;
    name?: string;
  };
};

export const validateF5BigIpConnectionCredentials = async (
  config: TF5BigIpConnectionConfig,
  _gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">
) => {
  const { hostname, port, username, password } = config.credentials;

  const baseUrl = `https://${hostname}:${port ?? F5_BIG_IP_DEFAULT_PORT}`;

  let authToken: string | undefined;

  try {
    const loginData = await requestWithF5BigIpGateway<TF5BigIpLoginResponse>(config, gatewayV2Service, {
      method: "POST",
      url: `${baseUrl}/mgmt/shared/authn/login`,
      data: {
        username,
        password,
        loginProviderName: F5_BIG_IP_LOGIN_PROVIDER
      },
      headers: { "Content-Type": "application/json" }
    });

    authToken = loginData?.token?.token;

    if (!authToken) {
      throw new BadRequestError({
        message: "Unable to validate connection: login did not return an auth token"
      });
    }

    await requestWithF5BigIpGateway(config, gatewayV2Service, {
      method: "GET",
      url: `${baseUrl}/mgmt/tm/sys/version`,
      headers: {
        "Content-Type": "application/json",
        "X-F5-Auth-Token": authToken
      }
    });
  } catch (error: unknown) {
    if (error instanceof BadRequestError) {
      throw error;
    }
    throw new BadRequestError({
      message: `Unable to validate connection: ${error instanceof Error ? error.message : "verify credentials and that the F5 BIG-IP is reachable"}`
    });
  } finally {
    if (authToken) {
      try {
        await requestWithF5BigIpGateway(config, gatewayV2Service, {
          method: "DELETE",
          url: `${baseUrl}/mgmt/shared/authz/tokens/${encodeURIComponent(authToken)}`,
          headers: {
            "Content-Type": "application/json",
            "X-F5-Auth-Token": authToken
          }
        });
      } catch {
        // Ignore logout errors
      }
    }
  }

  return config.credentials;
};

export const executeF5BigIpOperationWithGateway = async <T>(
  config: {
    gatewayId?: string | null;
    credentials: TF5BigIpConnectionConfig["credentials"];
  },
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId"> | undefined,
  operation: (makeRequest: <R>(requestCfg: AxiosRequestConfig) => Promise<R>) => Promise<T>
): Promise<T> => {
  const { gatewayId, credentials } = config;
  const { hostname, port: credPort } = credentials;
  const port = credPort ?? F5_BIG_IP_DEFAULT_PORT;

  if (gatewayId && gatewayV2Service) {
    await blockLocalAndPrivateIpAddresses(`https://${hostname}`, true);

    const platformConnectionDetails = await gatewayV2Service.getPlatformConnectionDetailsByGatewayId({
      gatewayId,
      targetHost: hostname,
      targetPort: port
    });

    if (!platformConnectionDetails) {
      throw new BadRequestError({ message: "Unable to connect to gateway, no platform connection details found" });
    }

    return withGatewayV2Proxy(
      async (proxyPort) => {
        const httpsAgent = new https.Agent({
          servername: hostname,
          rejectUnauthorized: credentials.sslRejectUnauthorized,
          ca: credentials.sslCertificate ? [credentials.sslCertificate] : undefined
        });

        const proxyBaseUrl = `https://localhost:${proxyPort}`;
        const targetBaseUrl = `https://${hostname}:${port}`;

        const makeRequest = async <R>(requestCfg: AxiosRequestConfig): Promise<R> => {
          const resp = await request.request<R>({
            ...requestCfg,
            url: requestCfg.url?.replace(targetBaseUrl, proxyBaseUrl),
            headers: {
              ...requestCfg.headers,
              Host: hostname
            },
            httpsAgent,
            maxRedirects: 0
          });
          return resp.data;
        };

        return operation(makeRequest);
      },
      {
        protocol: GatewayProxyProtocol.Tcp,
        relayHost: platformConnectionDetails.relayHost,
        gateway: platformConnectionDetails.gateway,
        relay: platformConnectionDetails.relay
      }
    );
  }

  const httpsAgent = await buildSsrfSafeAgent(`https://${hostname}:${port}`, {
    ca: credentials.sslCertificate,
    rejectUnauthorized: credentials.sslRejectUnauthorized,
    servername: hostname
  });

  const makeRequest = async <R>(requestCfg: AxiosRequestConfig): Promise<R> => {
    const resp = await request.request<R>({
      ...requestCfg,
      httpsAgent,
      maxRedirects: 0
    });
    return resp.data;
  };

  return operation(makeRequest);
};
