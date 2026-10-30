import { AxiosError, AxiosRequestConfig } from "axios";
import https from "https";

import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { getConfig } from "@app/lib/config/env";
import { request } from "@app/lib/config/request";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { getMissingGatewayMessage } from "@app/lib/gateway-v2/gateway-errors";
import { withGatewayV2Proxy } from "@app/lib/gateway-v2/gateway-v2";
import { GatewayProxyProtocol } from "@app/lib/gateway-v2/types";
import { logger } from "@app/lib/logger";
import { safeRequest } from "@app/lib/validator";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { ImpervaConnectionMethod } from "./imperva-connection-enums";
import { TImpervaConnectionConfig } from "./imperva-connection-types";

// Custom certificate writes live on the provisioning API (my.imperva.com/api/prov/v2) while site and
// certificate reads live on the newer REST API (api.imperva.com), so a connection talks to both hosts.
export const IMPERVA_PROV_HOST = "my.imperva.com";
export const IMPERVA_PROV_BASE_PATH = "/api/prov/v2";
export const IMPERVA_REST_HOST = "api.imperva.com";
export const IMPERVA_SITES_BASE_PATH = "/sites-mgmt/v3";
export const IMPERVA_CERTIFICATES_BASE_PATH = "/certificates-ui/v3";

const IMPERVA_HTTPS_PORT = 443;
const IMPERVA_REQUEST_TIMEOUT_MS = 30_000;
const IMPERVA_MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
// Imperva only accepts these page sizes on the sites API
const IMPERVA_SITES_PAGE_SIZE = 100;
const IMPERVA_SITES_MIN_PAGE_SIZE = 10;
const IMPERVA_SITES_MAX_PAGES = 50;

type TImpervaCredentials = TImpervaConnectionConfig["credentials"];

export type TImpervaRequestArgs = Omit<AxiosRequestConfig, "url" | "baseURL" | "httpsAgent"> & {
  host: string;
  path: string;
};

export type TImpervaRequestFn = <R>(args: TImpervaRequestArgs) => Promise<R>;

// The gateway proxy rewrites whatever a request throws, so Imperva's own status and message are
// carried out on this instead of on the AxiosError.
export class ImpervaRequestError extends Error {
  public readonly status?: number;

  constructor({ message, status }: { message: string; status?: number }) {
    super(message);
    this.name = "ImpervaRequestError";
    this.status = status;
  }
}

export type TImpervaApiError = {
  status?: number;
  title?: string;
  detail?: string;
  code?: string;
};

export const getImpervaAuthHeaders = (credentials: TImpervaCredentials): Record<string, string> => ({
  "x-API-Id": credentials.apiId,
  "x-API-Key": credentials.apiKey
});

export const getImpervaAccountParams = (credentials: TImpervaCredentials): Record<string, string> =>
  credentials.accountId ? { caid: credentials.accountId } : {};

export const getImpervaConnectionListItem = () => {
  return {
    name: "Imperva" as const,
    app: AppConnection.Imperva as const,
    methods: Object.values(ImpervaConnectionMethod) as [ImpervaConnectionMethod.ApiKey]
  };
};

const IMPERVA_AUTH_GUIDANCE =
  "Check that the key is enabled under User Management > My Profile > API keys (Imperva creates keys disabled), that both the ID and the key were copied in full, that the key's role includes the Manage SSL Certificates permission, and that the account ID names an account the key can reach";

// Imperva reports errors three ways, and only errMsg says what a rejected credential got wrong.
export const extractImpervaErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof AxiosError) {
    const data = error.response?.data as
      | { errors?: TImpervaApiError[]; message?: string; res_message?: string; errMsg?: string }
      | undefined;
    const apiError = data?.errors?.[0];
    const reported = apiError
      ? [apiError.title, apiError.detail].filter(Boolean).join(": ") || undefined
      : data?.res_message || data?.message || data?.errMsg;

    const status = error.response?.status;
    if (status === 401 || status === 403) {
      return `${reported ?? "Imperva rejected the API ID or API key"}. ${IMPERVA_AUTH_GUIDANCE}`;
    }
    if (reported) return reported;
    if (status === 404) {
      return "Imperva could not find the website. Check the website ID, and set the account ID on the connection if the website belongs to a sub-account";
    }
    if (status === 429) {
      return "Imperva rate limited the request, try again shortly";
    }
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return fallback;
};

const toImpervaRequestError = (error: unknown): Error => {
  if (error instanceof AxiosError) {
    return new ImpervaRequestError({
      message: extractImpervaErrorMessage(error, "Imperva rejected the request"),
      status: error.response?.status
    });
  }
  return error instanceof Error ? error : new Error(String(error));
};

const buildDirectRequestFn =
  (credentials: TImpervaCredentials): TImpervaRequestFn =>
  async <R>({ host, path, ...requestCfg }: TImpervaRequestArgs) => {
    try {
      const resp = await safeRequest.request<R>({
        ...requestCfg,
        headers: { ...getImpervaAuthHeaders(credentials), ...requestCfg.headers },
        url: `https://${host}${path}`,
        servername: host,
        allowPrivateIps: getConfig().ALLOW_INTERNAL_IP_CONNECTIONS,
        timeout: IMPERVA_REQUEST_TIMEOUT_MS,
        maxContentLength: IMPERVA_MAX_RESPONSE_BYTES,
        maxBodyLength: IMPERVA_MAX_RESPONSE_BYTES
      });
      return resp.data;
    } catch (error) {
      throw toImpervaRequestError(error);
    }
  };

// One tunnel per host per operation, not per request: each proxy costs a relay connection.
export const withImpervaOperation = async <T>(
  config: { gatewayId?: string | null; credentials: TImpervaCredentials },
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId"> | undefined,
  operation: (makeRequest: TImpervaRequestFn) => Promise<T>
): Promise<T> => {
  const { gatewayId, credentials } = config;

  if (!gatewayId) return operation(buildDirectRequestFn(credentials));

  if (!gatewayV2Service) {
    throw new NotFoundError({ message: getMissingGatewayMessage(gatewayId) });
  }

  const resolveTarget = async (targetHost: string) => {
    const details = await gatewayV2Service.getPlatformConnectionDetailsByGatewayId({
      gatewayId,
      targetHost,
      targetPort: IMPERVA_HTTPS_PORT
    });

    if (!details) throw new NotFoundError({ message: getMissingGatewayMessage(gatewayId) });
    return details;
  };

  const [provTarget, restTarget] = await Promise.all([
    resolveTarget(IMPERVA_PROV_HOST),
    resolveTarget(IMPERVA_REST_HOST)
  ]);

  // withGatewayV2Proxy replaces the thrown error with one of its own, so Imperva's status and
  // message are kept here and rethrown once the proxies have been torn down.
  let operationError: Error | undefined;
  // Pooled per host for the operation, then destroyed: the proxy's port goes away with it, so a
  // socket kept alive past the teardown points at nothing.
  const agents: Record<string, https.Agent> = {
    [IMPERVA_PROV_HOST]: new https.Agent({ keepAlive: true, servername: IMPERVA_PROV_HOST }),
    [IMPERVA_REST_HOST]: new https.Agent({ keepAlive: true, servername: IMPERVA_REST_HOST })
  };

  try {
    return await withGatewayV2Proxy(
      async (provPort) =>
        withGatewayV2Proxy(
          async (restPort) => {
            const makeRequest: TImpervaRequestFn = async <R>({ host, path, ...requestCfg }: TImpervaRequestArgs) => {
              try {
                const resp = await request.request<R>({
                  ...requestCfg,
                  headers: { ...getImpervaAuthHeaders(credentials), ...requestCfg.headers, Host: host },
                  url: `https://localhost:${host === IMPERVA_PROV_HOST ? provPort : restPort}${path}`,
                  httpsAgent: agents[host],
                  timeout: IMPERVA_REQUEST_TIMEOUT_MS,
                  maxContentLength: IMPERVA_MAX_RESPONSE_BYTES,
                  maxBodyLength: IMPERVA_MAX_RESPONSE_BYTES
                });
                return resp.data;
              } catch (error) {
                throw toImpervaRequestError(error);
              }
            };

            try {
              return await operation(makeRequest);
            } catch (error) {
              operationError = error instanceof Error ? error : new Error(String(error));
              throw operationError;
            }
          },
          { protocol: GatewayProxyProtocol.Tcp, ...restTarget }
        ),
      { protocol: GatewayProxyProtocol.Tcp, ...provTarget }
    );
  } catch (error) {
    if (operationError) throw operationError;
    throw error;
  } finally {
    Object.values(agents).forEach((agent) => agent.destroy());
  }
};

export type TImpervaSite = {
  id: string;
  name: string;
  status?: string;
};

type TImpervaSitesResponse = {
  data?: Array<{ id?: number; name?: string; siteStatus?: string }>;
  meta?: { page?: number; size?: number; totalPages?: number; totalElements?: number };
};

export const listImpervaSites = async (
  config: { gatewayId?: string | null; credentials: TImpervaCredentials },
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId"> | undefined
): Promise<TImpervaSite[]> => {
  try {
    return await withImpervaOperation(config, gatewayV2Service, async (makeRequest) => {
      const sites: TImpervaSite[] = [];

      let page = 0;
      let hasMore = true;

      /* eslint-disable no-await-in-loop */
      while (hasMore && page < IMPERVA_SITES_MAX_PAGES) {
        const response = await makeRequest<TImpervaSitesResponse>({
          method: "GET",
          host: IMPERVA_REST_HOST,
          path: `${IMPERVA_SITES_BASE_PATH}/sites`,
          params: {
            page,
            size: IMPERVA_SITES_PAGE_SIZE,
            ...getImpervaAccountParams(config.credentials)
          }
        });

        const pageSites = response.data ?? [];
        for (const site of pageSites) {
          if (site.id !== undefined && site.id !== null) {
            sites.push({ id: String(site.id), name: site.name ?? String(site.id), status: site.siteStatus });
          }
        }

        page += 1;
        // Imperva's totalPages is the signal to follow, but a full page with no pagination metadata
        // means there is more to read rather than nothing.
        const totalPages = response.meta?.totalPages;
        hasMore = totalPages === undefined ? pageSites.length === IMPERVA_SITES_PAGE_SIZE : page < totalPages;
      }
      /* eslint-enable no-await-in-loop */

      if (hasMore) {
        logger.warn(`Imperva site listing stopped at ${IMPERVA_SITES_MAX_PAGES} pages, some websites are not listed`);
      }

      return sites;
    });
  } catch (error) {
    if (error instanceof ImpervaRequestError) {
      throw new BadRequestError({ message: `Unable to list Imperva websites: ${error.message}` });
    }
    throw error;
  }
};

export const validateImpervaConnectionCredentials = async (
  config: TImpervaConnectionConfig,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">
) => {
  const { credentials } = config;

  try {
    await withImpervaOperation({ gatewayId: config.gatewayId, credentials }, gatewayV2Service, (makeRequest) =>
      makeRequest<TImpervaSitesResponse>({
        method: "GET",
        host: IMPERVA_REST_HOST,
        path: `${IMPERVA_SITES_BASE_PATH}/sites`,
        params: { page: 0, size: IMPERVA_SITES_MIN_PAGE_SIZE, ...getImpervaAccountParams(credentials) }
      })
    );
  } catch (error) {
    // Only a refusal from Imperva becomes a validation error; a database or gateway failure keeps
    // its own class rather than being rendered as a 400 carrying a raw driver message.
    if (error instanceof ImpervaRequestError) {
      throw new BadRequestError({ message: `Unable to validate connection: ${error.message}` });
    }
    throw error;
  }

  return credentials;
};
