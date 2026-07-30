import { AxiosRequestConfig } from "axios";
import crypto from "crypto";
import https from "https";

import { TGatewayServiceFactory } from "@app/ee/services/gateway/gateway-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { GatewayProxyProtocol } from "@app/lib/gateway";
import { withGatewayV2Proxy } from "@app/lib/gateway-v2/gateway-v2";
import { blockLocalAndPrivateIpAddresses, buildSsrfSafeAgent } from "@app/lib/validator";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { NutanixPrismCentralConnectionMethod } from "./nutanix-prism-central-connection-enums";
import { TNutanixPrismCentralConnectionConfig } from "./nutanix-prism-central-connection-types";

export const NUTANIX_DEFAULT_PORT = 9440;

export const getNutanixPrismCentralConnectionListItem = () => {
  return {
    name: "Nutanix Prism Central" as const,
    app: AppConnection.NutanixPrismCentral as const,
    methods: Object.values(NutanixPrismCentralConnectionMethod) as [
      NutanixPrismCentralConnectionMethod.ApiKey,
      NutanixPrismCentralConnectionMethod.BasicAuth
    ]
  };
};

export const buildNutanixAuthHeaders = (
  credentials: TNutanixPrismCentralConnectionConfig["credentials"],
  method: NutanixPrismCentralConnectionMethod
): Record<string, string> => {
  // Nutanix uses NTNX-Request-Id for idempotency; must be unique per request
  const headers: Record<string, string> = {
    Accept: "application/json",
    "NTNX-Request-Id": crypto.randomUUID()
  };

  if (method === NutanixPrismCentralConnectionMethod.ApiKey) {
    const { apiKey } = credentials as { apiKey: string };
    headers["X-ntnx-api-key"] = apiKey;
  } else {
    const { username, password } = credentials as { username: string; password: string };
    headers.Authorization = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
  }

  return headers;
};

export type TNutanixResponse<R> = {
  data: R;
  headers: Record<string, string | undefined>;
};

export type TNutanixMakeRequest = <R>(requestCfg: AxiosRequestConfig) => Promise<TNutanixResponse<R>>;

export const executeNutanixOperationWithGateway = async <T>(
  config: {
    gatewayId?: string | null;
    credentials: TNutanixPrismCentralConnectionConfig["credentials"];
    method: NutanixPrismCentralConnectionMethod;
  },
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId"> | undefined,
  operation: (makeRequest: TNutanixMakeRequest) => Promise<T>
): Promise<T> => {
  const { gatewayId, credentials, method } = config;
  const { hostname, port: credPort } = credentials;
  const port = credPort ?? NUTANIX_DEFAULT_PORT;

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

        const makeRequest: TNutanixMakeRequest = async <R>(requestCfg: AxiosRequestConfig) => {
          const resp = await request.request<R>({
            ...requestCfg,
            url: requestCfg.url?.replace(targetBaseUrl, proxyBaseUrl),
            headers: {
              ...buildNutanixAuthHeaders(credentials, method),
              ...requestCfg.headers,
              Host: hostname
            },
            httpsAgent,
            maxRedirects: 0
          });
          return { data: resp.data, headers: resp.headers as Record<string, string | undefined> };
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

  const makeRequest: TNutanixMakeRequest = async <R>(requestCfg: AxiosRequestConfig) => {
    const resp = await request.request<R>({
      ...requestCfg,
      headers: {
        ...buildNutanixAuthHeaders(credentials, method),
        ...requestCfg.headers
      },
      httpsAgent,
      maxRedirects: 0
    });
    return { data: resp.data, headers: resp.headers as Record<string, string | undefined> };
  };

  return operation(makeRequest);
};

export const validateNutanixPrismCentralConnectionCredentials = async (
  config: TNutanixPrismCentralConnectionConfig,
  _gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">
) => {
  const { credentials } = config;
  const { hostname, port: credPort } = credentials;
  const port = credPort ?? NUTANIX_DEFAULT_PORT;
  const baseUrl = `https://${hostname}:${port}`;

  try {
    await executeNutanixOperationWithGateway(
      { gatewayId: config.gatewayId, credentials, method: config.method },
      gatewayV2Service,
      async (makeRequest) => {
        await makeRequest({
          method: "GET",
          url: `${baseUrl}/api/clustermgmt/v4.2/config/clusters`,
          params: { $limit: 1 }
        });
      }
    );
  } catch (error: unknown) {
    if (error instanceof BadRequestError) throw error;
    throw new BadRequestError({
      message: `Unable to validate Nutanix Prism Central connection: ${error instanceof Error ? error.message : "verify credentials and that Prism Central is reachable"}`
    });
  }

  return config.credentials;
};

type TNutanixClusterResponse = {
  data: Array<{
    extId: string;
    name: string;
  }>;
};

export const listNutanixClusters = async (
  config: TNutanixPrismCentralConnectionConfig,
  gatewayV2Service?: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">
): Promise<{ id: string; name: string }[]> => {
  const { credentials } = config;
  const { hostname, port: credPort } = credentials;
  const port = credPort ?? NUTANIX_DEFAULT_PORT;
  const baseUrl = `https://${hostname}:${port}`;

  try {
    return await executeNutanixOperationWithGateway(
      { gatewayId: config.gatewayId, credentials, method: config.method },
      gatewayV2Service,
      async (makeRequest) => {
        const { data: body } = await makeRequest<TNutanixClusterResponse>({
          method: "GET",
          url: `${baseUrl}/api/clustermgmt/v4.2/config/clusters`,
          params: { $limit: 100 }
        });

        if (!Array.isArray(body?.data)) return [];

        return body.data
          .map((cluster) => ({
            id: cluster.extId,
            name: cluster.name
          }))
          .filter((c) => c.id && c.name);
      }
    );
  } catch (error: unknown) {
    if (error instanceof BadRequestError) throw error;
    throw new BadRequestError({
      message: `Failed to fetch Nutanix clusters: ${error instanceof Error ? error.message : "verify credentials and that Prism Central is reachable"}`
    });
  }
};
