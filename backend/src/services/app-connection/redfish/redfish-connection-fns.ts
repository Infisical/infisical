import { AxiosRequestConfig, HttpStatusCode, isAxiosError } from "axios";
import net from "net";

import { RuleViolationError } from "@app/domains/lib/errors";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { BadRequestError } from "@app/lib/errors";
import { getMissingGatewayMessage } from "@app/lib/gateway-v2/gateway-errors";
import { withGatewayV2Proxy } from "@app/lib/gateway-v2/gateway-v2";
import { GatewayProxyProtocol } from "@app/lib/gateway-v2/types";
import { safeRequest } from "@app/lib/validator";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { RedfishConnectionMethod } from "./redfish-connection-enums";
import { TRedfishConnectionConfig } from "./redfish-connection-types";

export const REDFISH_DEFAULT_PORT = 443;
const REDFISH_REQUEST_TIMEOUT_MS = 30_000;
const REDFISH_ACCOUNTS_PATH = "/redfish/v1/AccountService/Accounts/";

export const getRedfishConnectionListItem = () => {
  return {
    name: "Redfish" as const,
    app: AppConnection.Redfish as const,
    methods: Object.values(RedfishConnectionMethod) as [RedfishConnectionMethod.BasicAuth]
  };
};

// IPv6 literals must be bracketed in URLs and Host headers
export const toUrlHost = (hostname: string) => (net.isIPv6(hostname) ? `[${hostname}]` : hostname);

const getRedfishBaseUrl = (credentials: TRedfishConnectionConfig["credentials"]) =>
  `https://${toUrlHost(credentials.hostname)}:${credentials.port ?? REDFISH_DEFAULT_PORT}`;

const getRedfishAuthHeaders = ({ username, password }: TRedfishConnectionConfig["credentials"]) => ({
  Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`,
  Accept: "application/json",
  "OData-Version": "4.0"
});

// OpenSSL's FIPS provider refuses TLS 1.2 handshakes without Extended Master Secret (RFC 7627), which older BMC
// firmware does not negotiate. The raw error is an OpenSSL stack string, and it survives gateway error wrapping
// only as message text
const getRedfishTlsErrorMessage = (error: unknown, hostname: string) => {
  if (!(error instanceof Error) || !error.message.includes("ems not enabled")) return undefined;

  return `Redfish service at '${hostname}' negotiated TLS 1.2 without Extended Master Secret, which FIPS mode does not allow. Enable TLS 1.3 on the server's management controller or update its firmware.`;
};

// requestCfg.url is a path relative to the Redfish service root (e.g. "/redfish/v1/Systems/1")
export const executeRedfishRequest = async <T>(
  config: Pick<TRedfishConnectionConfig, "gatewayId" | "credentials">,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId"> | undefined,
  requestCfg: AxiosRequestConfig
): Promise<T> => {
  const { gatewayId, credentials } = config;
  const { hostname } = credentials;
  const port = credentials.port ?? REDFISH_DEFAULT_PORT;

  const headers = { ...getRedfishAuthHeaders(credentials), ...requestCfg.headers };
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
          timeout: REDFISH_REQUEST_TIMEOUT_MS,
          ...requestCfg,
          ...tlsOptions,
          url: `https://localhost:${proxyPort}${requestCfg.url ?? ""}`,
          // safeRequest's cached agent keeps sockets alive, which would hold the tunnel open after the proxy closes
          headers: { ...headers, Host: toUrlHost(hostname), Connection: "close" },
          // the hop is the local gateway proxy, and the Redfish service it reaches sits in the gateway's network
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
    timeout: REDFISH_REQUEST_TIMEOUT_MS,
    ...requestCfg,
    ...tlsOptions,
    url: `${getRedfishBaseUrl(credentials)}${requestCfg.url ?? ""}`,
    headers
  });
  return resp.data;
};

type TRedfishAccountCollection = {
  "@odata.id"?: string;
  Members?: { "@odata.id": string }[];
};

export const validateRedfishConnectionCredentials = async (
  config: TRedfishConnectionConfig,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">
) => {
  const { hostname } = config.credentials;

  let accounts: TRedfishAccountCollection;
  try {
    accounts = await executeRedfishRequest<TRedfishAccountCollection>(config, gatewayV2Service, {
      method: "GET",
      url: REDFISH_ACCOUNTS_PATH
    });
  } catch (error: unknown) {
    const tlsErrorMessage = getRedfishTlsErrorMessage(error, hostname);
    if (tlsErrorMessage) throw new BadRequestError({ message: `Unable to validate connection: ${tlsErrorMessage}` });

    if (error instanceof BadRequestError || error instanceof RuleViolationError) throw error;

    if (isAxiosError(error)) {
      if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
        throw new BadRequestError({
          message: `Unable to validate connection: Redfish service at '${hostname}' did not respond within ${REDFISH_REQUEST_TIMEOUT_MS / 1000} seconds.`
        });
      }
      if (error.response?.status === HttpStatusCode.Unauthorized) {
        throw new BadRequestError({
          message: `Unable to validate connection: Redfish service at '${hostname}' rejected the username or password.`
        });
      }
      if (error.response?.status === HttpStatusCode.Forbidden) {
        throw new BadRequestError({
          message: `Unable to validate connection: the account is not permitted to read accounts on '${hostname}'. Check the account's privileges.`
        });
      }
      if (error.response?.status === HttpStatusCode.NotFound) {
        throw new BadRequestError({
          message: `Unable to validate connection: '${hostname}' does not expose the Redfish account service. Verify the hostname points to a server management controller with Redfish enabled.`
        });
      }
      if (error.response) {
        throw new BadRequestError({
          message: `Unable to validate connection: Redfish service at '${hostname}' responded with status ${error.response.status}.`
        });
      }
    }

    throw new BadRequestError({
      message: `Unable to validate connection: ${error instanceof Error ? error.message : `verify that Redfish service at '${hostname}' is reachable`}`
    });
  }

  if (!accounts || typeof accounts !== "object" || !Array.isArray(accounts.Members)) {
    throw new BadRequestError({
      message: `Unable to validate connection: '${hostname}' did not return a valid Redfish response. Verify the hostname points to a server management controller with Redfish enabled.`
    });
  }

  return config.credentials;
};
