import { AxiosRequestConfig, HttpStatusCode, isAxiosError } from "axios";
import net from "net";

import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { BadRequestError } from "@app/lib/errors";
import { getMissingGatewayMessage } from "@app/lib/gateway-v2/gateway-errors";
import { withGatewayV2Proxy } from "@app/lib/gateway-v2/gateway-v2";
import { GatewayProxyProtocol } from "@app/lib/gateway-v2/types";
import { safeRequest } from "@app/lib/validator";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { HpeIloConnectionMethod } from "./hpe-ilo-connection-enums";
import { THpeIloConnectionConfig } from "./hpe-ilo-connection-types";

export const HPE_ILO_DEFAULT_PORT = 443;
const HPE_ILO_REQUEST_TIMEOUT_MS = 30_000;
const HPE_ILO_ACCOUNTS_PATH = "/redfish/v1/AccountService/Accounts/";

export const getHpeIloConnectionListItem = () => {
  return {
    name: "HPE iLO" as const,
    app: AppConnection.HpeIloRedFish as const,
    methods: Object.values(HpeIloConnectionMethod) as [HpeIloConnectionMethod.BasicAuth]
  };
};

// IPv6 literals must be bracketed in URLs and Host headers
const toUrlHost = (hostname: string) => (net.isIPv6(hostname) ? `[${hostname}]` : hostname);

const getHpeIloBaseUrl = (credentials: THpeIloConnectionConfig["credentials"]) =>
  `https://${toUrlHost(credentials.hostname)}:${credentials.port ?? HPE_ILO_DEFAULT_PORT}`;

const getHpeIloAuthHeaders = ({ username, password }: THpeIloConnectionConfig["credentials"]) => ({
  Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`,
  Accept: "application/json",
  "OData-Version": "4.0"
});

// requestCfg.url is a path relative to the iLO root (e.g. "/redfish/v1/Systems/1")
export const executeHpeIloRequest = async <T>(
  config: Pick<THpeIloConnectionConfig, "gatewayId" | "credentials">,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId"> | undefined,
  requestCfg: AxiosRequestConfig
): Promise<T> => {
  const { gatewayId, credentials } = config;
  const { hostname } = credentials;
  const port = credentials.port ?? HPE_ILO_DEFAULT_PORT;

  const headers = { ...getHpeIloAuthHeaders(credentials), ...requestCfg.headers };
  const tlsOptions = {
    ca: credentials.sslCertificate,
    rejectUnauthorized: credentials.sslRejectUnauthorized,
    servername: hostname
  };

  if (gatewayId) {
    // a pinned gateway must never fall through to the direct-dial branch below
    if (!gatewayV2Service) {
      throw new BadRequestError({ message: getMissingGatewayMessage(gatewayId) });
    }

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
        const resp = await safeRequest.request<T>({
          timeout: HPE_ILO_REQUEST_TIMEOUT_MS,
          ...requestCfg,
          ...tlsOptions,
          url: `https://localhost:${proxyPort}${requestCfg.url ?? ""}`,
          // safeRequest's cached agent keeps sockets alive, which would hold the tunnel open after the proxy closes
          headers: { ...headers, Host: toUrlHost(hostname), Connection: "close" },
          // the hop is the local gateway proxy, and the iLO it reaches sits in the gateway's network
          allowPrivateIps: true
        });
        return resp.data;
      },
      {
        protocol: GatewayProxyProtocol.Tcp,
        ...platformConnectionDetails
      }
    );
  }

  const resp = await safeRequest.request<T>({
    timeout: HPE_ILO_REQUEST_TIMEOUT_MS,
    ...requestCfg,
    ...tlsOptions,
    url: `${getHpeIloBaseUrl(credentials)}${requestCfg.url ?? ""}`,
    headers
  });
  return resp.data;
};

type THpeIloAccountCollection = {
  "@odata.id"?: string;
  Members?: { "@odata.id": string }[];
};

export const validateHpeIloConnectionCredentials = async (
  config: THpeIloConnectionConfig,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">
) => {
  const { hostname } = config.credentials;

  let accounts: THpeIloAccountCollection;
  try {
    accounts = await executeHpeIloRequest<THpeIloAccountCollection>(config, gatewayV2Service, {
      method: "GET",
      url: HPE_ILO_ACCOUNTS_PATH
    });
  } catch (error: unknown) {
    if (error instanceof BadRequestError) throw error;

    if (isAxiosError(error)) {
      if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
        throw new BadRequestError({
          message: `Unable to validate connection: HPE iLO at '${hostname}' did not respond within ${HPE_ILO_REQUEST_TIMEOUT_MS / 1000} seconds.`
        });
      }
      if (error.response?.status === HttpStatusCode.Unauthorized) {
        throw new BadRequestError({
          message: `Unable to validate connection: HPE iLO at '${hostname}' rejected the username or password.`
        });
      }
      if (error.response?.status === HttpStatusCode.Forbidden) {
        throw new BadRequestError({
          message: `Unable to validate connection: the iLO account is not permitted to read accounts on '${hostname}'. Check the account's privileges.`
        });
      }
      if (error.response?.status === HttpStatusCode.NotFound) {
        throw new BadRequestError({
          message: `Unable to validate connection: '${hostname}' does not expose the Redfish account service. Verify the hostname points to an HPE iLO interface with Redfish enabled.`
        });
      }
      if (error.response) {
        throw new BadRequestError({
          message: `Unable to validate connection: HPE iLO at '${hostname}' responded with status ${error.response.status}.`
        });
      }
    }

    throw new BadRequestError({
      message: `Unable to validate connection: ${error instanceof Error ? error.message : `verify that HPE iLO at '${hostname}' is reachable`}`
    });
  }

  if (!accounts || typeof accounts !== "object" || !Array.isArray(accounts.Members)) {
    throw new BadRequestError({
      message: `Unable to validate connection: '${hostname}' did not return a valid Redfish response. Verify the hostname points to an HPE iLO interface.`
    });
  }

  return config.credentials;
};
