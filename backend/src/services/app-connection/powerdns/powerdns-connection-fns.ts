import { AxiosRequestConfig, isAxiosError } from "axios";

import { verifyHostInputValidity } from "@app/ee/services/dynamic-secret/dynamic-secret-fns";
import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { removeTrailingSlash } from "@app/lib/fn";
import { withGatewayV2Proxy } from "@app/lib/gateway-v2/gateway-v2";
import { GatewayProxyProtocol } from "@app/lib/gateway-v2/types";
import { logger, sanitizeUrlForLog } from "@app/lib/logger";
import { getSharedHttpsAgent, safeRequest } from "@app/lib/validator/safe-request";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { PowerDnsConnectionMethod } from "./powerdns-connection-enums";
import { TPowerDnsConnectionConfig, TPowerDnsRrset, TPowerDnsZone } from "./powerdns-connection-types";

const POWERDNS_DEFAULT_SERVER_ID = "localhost";
export const POWERDNS_REQUEST_TIMEOUT_MS = 30_000;
const POWERDNS_MAX_RESPONSE_BYTES = 10 * 1024 * 1024;

export type TPowerDnsGatewayDeps = {
  gatewayV2Service?: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
  gatewayPoolService?: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">;
};

type TPowerDnsRequest = {
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  path: string;
  data?: unknown;
  params?: Record<string, string>;
};

export const getPowerDnsConnectionListItem = () => {
  return {
    name: "PowerDNS" as const,
    app: AppConnection.PowerDns as const,
    methods: Object.values(PowerDnsConnectionMethod) as [PowerDnsConnectionMethod.ApiKey]
  };
};

export const getPowerDnsApiUrl = (apiUrl: string, path: string, serverId?: string) =>
  `${removeTrailingSlash(apiUrl)}/api/v1/servers/${encodeURIComponent(serverId || POWERDNS_DEFAULT_SERVER_ID)}${path}`;

const toLoggableError = (error: unknown) => {
  if (isAxiosError(error)) {
    return {
      name: error.name,
      code: error.code,
      status: error.response?.status,
      message: error.message,
      url: error.config?.url ? sanitizeUrlForLog(error.config.url) : undefined,
      stack: error.stack
    };
  }

  if (error instanceof Error) return { name: error.name, message: error.message, stack: error.stack };

  return { message: String(error) };
};

export const getPowerDnsErrorMessage = (error: unknown, fallback: string) => {
  if (isAxiosError(error)) {
    const body = error.response?.data as { error?: string } | string | undefined;

    if (error.response?.status === 401) return "PowerDNS rejected the API key";
    if (error.response?.status === 404) {
      return "PowerDNS returned 404. Verify the API URL and Server ID, and that the PowerDNS API is enabled";
    }
    if (typeof body === "object" && typeof body?.error === "string") return body.error;

    return error.message || fallback;
  }

  return error instanceof Error ? error.message : fallback;
};

export const powerDnsRequest = async <T>(
  config: Pick<TPowerDnsConnectionConfig, "credentials" | "gatewayId" | "gatewayPoolId">,
  { method, path, data, params }: TPowerDnsRequest,
  { gatewayV2Service, gatewayPoolService }: TPowerDnsGatewayDeps = {}
): Promise<T> => {
  const { credentials, gatewayId: directGatewayId, gatewayPoolId } = config;
  const { apiUrl, apiKey, serverId, sslCertificate, sslRejectUnauthorized } = credentials;

  if (gatewayPoolId && !gatewayPoolService) {
    throw new BadRequestError({
      message: "This PowerDNS connection uses a Gateway pool, which is not supported on this operation"
    });
  }

  const gatewayId =
    gatewayPoolId && gatewayPoolService
      ? await gatewayPoolService.resolveEffectiveGatewayId({ gatewayId: directGatewayId, gatewayPoolId })
      : directGatewayId;

  if (gatewayId && !gatewayV2Service) {
    throw new BadRequestError({
      message: "This PowerDNS connection uses a Gateway, which is not supported on this operation"
    });
  }

  const url = new URL(getPowerDnsApiUrl(apiUrl, path, serverId));
  const headers = {
    "X-API-Key": apiKey,
    Accept: "application/json",
    ...(data !== undefined && { "Content-Type": "application/json" })
  };

  const baseRequestConfig: AxiosRequestConfig = {
    method,
    params,
    ...(data !== undefined && { data }),
    timeout: POWERDNS_REQUEST_TIMEOUT_MS,
    maxContentLength: POWERDNS_MAX_RESPONSE_BYTES,
    maxBodyLength: POWERDNS_MAX_RESPONSE_BYTES
  };

  if (!gatewayId || !gatewayV2Service) {
    const { data: responseData } = await safeRequest.request<T>({
      ...baseRequestConfig,
      url: url.toString(),
      headers,
      ca: sslCertificate,
      rejectUnauthorized: sslRejectUnauthorized
    });

    return responseData;
  }

  const [targetHost] = await verifyHostInputValidity({ host: url.hostname, isGateway: true, isDynamicSecret: false });
  const isHttps = url.protocol === "https:";
  const targetPort = url.port ? Number(url.port) : (isHttps && 443) || 80;

  const platformConnectionDetails = await gatewayV2Service.getPlatformConnectionDetailsByGatewayId({
    gatewayId,
    targetHost,
    targetPort
  });

  if (!platformConnectionDetails) {
    throw new BadRequestError({ message: "Unable to connect to the Gateway assigned to this PowerDNS connection" });
  }

  return withGatewayV2Proxy(
    async (proxyPort) => {
      const proxiedUrl = new URL(url.toString());
      proxiedUrl.host = `localhost:${proxyPort}`;

      const { data: responseData } = await request.request<T>({
        ...baseRequestConfig,
        url: proxiedUrl.toString(),
        headers: { ...headers, Host: url.host },
        maxRedirects: 0,
        ...(isHttps && {
          httpsAgent: getSharedHttpsAgent({
            servername: targetHost,
            ca: sslCertificate,
            rejectUnauthorized: sslRejectUnauthorized ?? true
          })
        })
      });

      return responseData;
    },
    {
      protocol: GatewayProxyProtocol.Tcp,
      ...platformConnectionDetails
    }
  );
};

export const listPowerDnsZones = async (
  config: TPowerDnsConnectionConfig,
  deps: TPowerDnsGatewayDeps = {}
): Promise<TPowerDnsZone[]> => {
  try {
    const zones = await powerDnsRequest<{ id: string; name: string }[]>(
      config,
      { method: "GET", path: "/zones" },
      deps
    );

    if (!Array.isArray(zones)) return [];

    return zones.filter((zone) => zone.id && zone.name).map((zone) => ({ id: zone.id, name: zone.name }));
  } catch (error) {
    if (error instanceof BadRequestError) throw error;

    logger.error(toLoggableError(error), "Failed to list PowerDNS zones");
    throw new BadRequestError({
      message: `Failed to list PowerDNS zones: ${getPowerDnsErrorMessage(error, "verify the API URL and API key")}`
    });
  }
};

export const getPowerDnsZoneRrset = async (
  config: TPowerDnsConnectionConfig,
  { zoneId, name, type }: { zoneId: string; name: string; type: string },
  deps: TPowerDnsGatewayDeps = {}
): Promise<TPowerDnsRrset | undefined> => {
  try {
    const zone = await powerDnsRequest<{ rrsets?: TPowerDnsRrset[] }>(
      config,
      {
        method: "GET",
        path: `/zones/${encodeURIComponent(zoneId)}`,
        params: { rrset_name: name, rrset_type: type }
      },
      deps
    );

    return zone.rrsets?.find((rrset) => rrset.name === name && rrset.type === type);
  } catch (error) {
    if (error instanceof BadRequestError) throw error;

    logger.error(toLoggableError(error), `Failed to read PowerDNS zone [zoneId=${zoneId}] [name=${name}]`);
    throw new Error(`Failed to read PowerDNS zone '${zoneId}': ${getPowerDnsErrorMessage(error, "unknown error")}`);
  }
};

export const patchPowerDnsZoneRrsets = async (
  config: TPowerDnsConnectionConfig,
  { zoneId, rrsets }: { zoneId: string; rrsets: (TPowerDnsRrset & { changetype: "REPLACE" | "DELETE" })[] },
  deps: TPowerDnsGatewayDeps = {}
): Promise<void> => {
  try {
    await powerDnsRequest(
      config,
      { method: "PATCH", path: `/zones/${encodeURIComponent(zoneId)}`, data: { rrsets } },
      deps
    );
  } catch (error) {
    if (error instanceof BadRequestError) throw error;

    logger.error(toLoggableError(error), `Failed to update PowerDNS records [zoneId=${zoneId}]`);
    throw new Error(
      `Failed to update PowerDNS records in zone '${zoneId}': ${getPowerDnsErrorMessage(error, "unknown error")}`
    );
  }
};

export const validatePowerDnsConnectionCredentials = async (
  config: TPowerDnsConnectionConfig,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">
) => {
  try {
    await powerDnsRequest(config, { method: "GET", path: "/zones" }, { gatewayV2Service });
  } catch (error) {
    if (error instanceof BadRequestError) throw error;

    logger.error(toLoggableError(error), "Failed to validate PowerDNS connection credentials");
    throw new BadRequestError({
      message: `Unable to validate PowerDNS connection: ${getPowerDnsErrorMessage(error, "verify the API URL and API key")}`
    });
  }

  return config.credentials;
};
