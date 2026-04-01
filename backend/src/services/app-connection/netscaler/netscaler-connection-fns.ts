import { AxiosRequestConfig } from "axios";
import https from "https";

import { TGatewayServiceFactory } from "@app/ee/services/gateway/gateway-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { GatewayProxyProtocol } from "@app/lib/gateway";
import { withGatewayV2Proxy } from "@app/lib/gateway-v2/gateway-v2";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { NetScalerConnectionMethod } from "./netscaler-connection-enums";
import { TNetScalerConnectionConfig } from "./netscaler-connection-types";

export const createNetScalerHttpsAgent = (credentials: {
  sslRejectUnauthorized?: boolean;
  sslCertificate?: string;
}): https.Agent => {
  return new https.Agent({
    rejectUnauthorized: credentials.sslRejectUnauthorized,
    ca: credentials.sslCertificate ? [credentials.sslCertificate] : undefined
  });
};

export const getNetScalerConnectionListItem = () => {
  return {
    name: "NetScaler" as const,
    app: AppConnection.NetScaler as const,
    methods: Object.values(NetScalerConnectionMethod) as [NetScalerConnectionMethod.BasicAuth]
  };
};

const requestWithNetScalerGateway = async <T>(
  config: TNetScalerConnectionConfig,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">,
  requestConfig: AxiosRequestConfig
): Promise<T> => {
  const { gatewayId, credentials } = config;
  const { hostname, port: credPort } = credentials;
  const port = credPort ?? 443;

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
          httpsAgent
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

  const httpsAgent = createNetScalerHttpsAgent(credentials);
  const resp = await request.request<T>({
    ...requestConfig,
    httpsAgent
  });
  return resp.data;
};

export const validateNetScalerConnectionCredentials = async (
  config: TNetScalerConnectionConfig,
  _gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">
) => {
  const { hostname, port, username, password } = config.credentials;

  const baseUrl = `https://${hostname}:${port ?? 443}/nitro/v1/config`;

  let sessionId: string | undefined;

  try {
    const loginData = await requestWithNetScalerGateway<{ sessionid?: string }>(config, gatewayV2Service, {
      method: "POST",
      url: `${baseUrl}/login`,
      data: { login: { username, password } },
      headers: { "Content-Type": "application/json" }
    });

    sessionId = loginData?.sessionid;

    if (!sessionId) {
      throw new BadRequestError({
        message: "Unable to validate connection: login did not return a session ID"
      });
    }
  } catch (error: unknown) {
    if (error instanceof BadRequestError) {
      throw error;
    }
    throw new BadRequestError({
      message: `Unable to validate connection: ${error instanceof Error ? error.message : "verify credentials and that the NetScaler is reachable"}`
    });
  } finally {
    if (sessionId) {
      try {
        await requestWithNetScalerGateway(config, gatewayV2Service, {
          method: "POST",
          url: `${baseUrl}/logout`,
          data: { logout: {} },
          headers: {
            "Content-Type": "application/json",
            Cookie: `NITRO_AUTH_TOKEN=${sessionId}`
          }
        });
      } catch {
        // Ignore logout errors
      }
    }
  }

  return config.credentials;
};

export const executeNetScalerOperationWithGateway = async <T>(
  config: {
    gatewayId?: string | null;
    credentials: TNetScalerConnectionConfig["credentials"];
  },
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId"> | undefined,
  operation: (makeRequest: <R>(requestCfg: AxiosRequestConfig) => Promise<R>) => Promise<T>
): Promise<T> => {
  const { gatewayId, credentials } = config;
  const { hostname, port: credPort } = credentials;
  const port = credPort ?? 443;

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
            httpsAgent
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

  const httpsAgent = createNetScalerHttpsAgent(credentials);

  const makeRequest = async <R>(requestCfg: AxiosRequestConfig): Promise<R> => {
    const resp = await request.request<R>({
      ...requestCfg,
      httpsAgent
    });
    return resp.data;
  };

  return operation(makeRequest);
};
