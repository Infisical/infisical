/* eslint-disable no-await-in-loop */
import { AxiosError, AxiosRequestConfig } from "axios";
import { XMLParser } from "fast-xml-parser";
import RE2 from "re2";

import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { getConfig } from "@app/lib/config/env";
import { request } from "@app/lib/config/request";
import { delay } from "@app/lib/delay";
import { BadRequestError, GatewayTransportError } from "@app/lib/errors";
import { getMissingGatewayMessage } from "@app/lib/gateway-v2/gateway-errors";
import { withGatewayV2Proxy } from "@app/lib/gateway-v2/gateway-v2";
import { GatewayProxyProtocol } from "@app/lib/gateway-v2/types";
import { RETRYABLE_NETWORK_ERRORS } from "@app/lib/retry/network-errors";
import { blockLocalAndPrivateIpAddresses, safeRequest } from "@app/lib/validator";
import { getSharedHttpsAgent } from "@app/lib/validator/safe-request";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { PaloAltoNetworksConnectionMethod } from "./palo-alto-networks-connection-enums";
import { TPaloAltoNetworksConnection, TPaloAltoNetworksConnectionConfig } from "./palo-alto-networks-connection-types";

const PAN_OS_DEFAULT_PORT = 443;
const PAN_OS_REQUEST_TIMEOUT_MS = 60_000;
const PAN_OS_JOB_POLL_INTERVAL_MS = 3_000;
const PAN_OS_JOB_TIMEOUT_MS = 15 * 60_000;
const NO_CHANGES_PATTERN = new RE2("no changes to commit", "i");
const JOB_ID_PATTERN = new RE2("^\\d+$");

export const PAN_OS_LOCALHOST_ENTRY = "entry[@name='localhost.localdomain']";

type TPaloAltoNetworksCredentials = TPaloAltoNetworksConnection["credentials"];

type TRequestFn = <R>(requestCfg: AxiosRequestConfig) => Promise<R>;

const panOsXmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  isArray: (tagName) => ["entry", "member", "line"].includes(tagName)
});

type TPanOsXmlNode = Record<string, unknown>;

type TPanOsResponse = {
  "@_status"?: string;
  "@_code"?: string;
  result?: TPanOsXmlNode;
  msg?: unknown;
};

type TPanOsJob = {
  status: string;
  result: string;
  details: string[];
  devices: Array<{ name: string; result: string; details: string[] }>;
};

export class PanOsApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PanOsApiError";
  }
}

const collectText = (node: unknown): string[] => {
  if (node === undefined || node === null) return [];
  if (typeof node === "string" || typeof node === "number") return [String(node).trim()].filter(Boolean);
  if (Array.isArray(node)) return node.flatMap(collectText);
  if (typeof node === "object") {
    return Object.entries(node)
      .filter(([key]) => !key.startsWith("@_"))
      .flatMap(([, value]) => collectText(value));
  }
  return [];
};

const parsePanOsResponse = (xml: string): TPanOsResponse => {
  const parsed = panOsXmlParser.parse(xml) as { response?: TPanOsResponse };
  if (!parsed?.response) {
    throw new PanOsApiError(
      "Received an unexpected response from PAN-OS. Verify the hostname and port point to the management interface."
    );
  }
  return parsed.response;
};

export const getEntries = (node: unknown): TPanOsXmlNode[] =>
  (node as { entry?: TPanOsXmlNode[] } | undefined)?.entry ?? [];

const getResponseMessage = (response: TPanOsResponse) =>
  collectText(response.msg ?? (response.result as TPanOsXmlNode | undefined)?.msg ?? response.result).join(" ");

export const getPaloAltoNetworksConnectionListItem = () => {
  return {
    name: "Palo Alto Networks" as const,
    app: AppConnection.PaloAltoNetworks as const,
    methods: Object.values(PaloAltoNetworksConnectionMethod) as [PaloAltoNetworksConnectionMethod.BasicAuth]
  };
};

const executePaloAltoNetworksOperationWithGateway = async <T>(
  config: {
    gatewayId?: string | null;
    credentials: TPaloAltoNetworksCredentials;
  },
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId"> | undefined,
  operation: (makeRequest: TRequestFn) => Promise<T>
): Promise<T> => {
  const { gatewayId, credentials } = config;
  const { hostname } = credentials;
  const port = credentials.port ?? PAN_OS_DEFAULT_PORT;

  if (gatewayId) {
    if (!gatewayV2Service) {
      throw new BadRequestError({ message: getMissingGatewayMessage(gatewayId) });
    }

    await blockLocalAndPrivateIpAddresses(`https://${hostname}`, true);

    const platformConnectionDetails = await gatewayV2Service.getPlatformConnectionDetailsByGatewayId({
      gatewayId,
      targetHost: hostname,
      targetPort: port
    });

    if (!platformConnectionDetails) {
      throw new BadRequestError({ message: getMissingGatewayMessage(gatewayId) });
    }

    return withGatewayV2Proxy(
      async (proxyPort) => {
        const httpsAgent = getSharedHttpsAgent({
          servername: hostname,
          ca: credentials.sslCertificate,
          rejectUnauthorized: credentials.sslRejectUnauthorized ?? true
        });

        return operation(async <R>(requestCfg: AxiosRequestConfig) => {
          const resp = await request.request<R>({
            ...requestCfg,
            url: `https://localhost:${proxyPort}${requestCfg.url}`,
            headers: { ...requestCfg.headers, Host: hostname },
            httpsAgent,
            maxRedirects: 0
          });
          return resp.data;
        });
      },
      {
        protocol: GatewayProxyProtocol.Tcp,
        ...platformConnectionDetails
      }
    );
  }

  return operation(async <R>(requestCfg: AxiosRequestConfig) => {
    const resp = await safeRequest.request<R>({
      ...requestCfg,
      url: `https://${hostname}:${port}${requestCfg.url}`,
      ca: credentials.sslCertificate,
      rejectUnauthorized: credentials.sslRejectUnauthorized,
      servername: hostname,
      allowPrivateIps: getConfig().ALLOW_INTERNAL_IP_CONNECTIONS
    });
    return resp.data;
  });
};

const createPanOsClient = async (credentials: TPaloAltoNetworksCredentials, makeRequest: TRequestFn) => {
  const send = async (data: URLSearchParams | FormData, headers: Record<string, string>, query?: URLSearchParams) => {
    let xml: string;
    try {
      xml = await makeRequest<string>({
        method: "POST",
        url: query ? `/api/?${query.toString()}` : "/api/",
        data,
        headers,
        responseType: "text",
        timeout: PAN_OS_REQUEST_TIMEOUT_MS
      });
    } catch (error) {
      if (error instanceof AxiosError && typeof error.response?.data === "string" && error.response.data) {
        xml = error.response.data;
      } else {
        throw error;
      }
    }

    const response = parsePanOsResponse(xml);
    if (response["@_status"] !== "success") {
      throw new PanOsApiError(getResponseMessage(response) || "PAN-OS rejected the request");
    }
    return response;
  };

  const keygenResponse = await send(
    new URLSearchParams({ type: "keygen", user: credentials.username, password: credentials.password }),
    { "Content-Type": "application/x-www-form-urlencoded" }
  );
  const apiKey = collectText((keygenResponse.result as { key?: unknown } | undefined)?.key)[0];
  if (!apiKey) {
    throw new PanOsApiError("PAN-OS did not return an API key for these credentials");
  }

  const call = (params: Record<string, string>) =>
    send(new URLSearchParams(params), {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-PAN-KEY": apiKey
    });

  const op = async (cmd: string) => (await call({ type: "op", cmd })).result ?? {};

  const getConfigNode = async (xpath: string) => (await call({ type: "config", action: "get", xpath })).result ?? {};

  const parseJob = (node: unknown): TPanOsJob => {
    const job = ((node as { job?: TPanOsXmlNode[] | TPanOsXmlNode })?.job ?? {}) as TPanOsXmlNode;
    const jobNode = (Array.isArray(job) ? job[0] : job) as TPanOsXmlNode;
    const deviceEntries = getEntries(jobNode.devices).map((entry) => ({
      name: String(entry.devicename ?? entry["serial-no"] ?? entry["@_name"] ?? "unknown"),
      result: String(entry.result ?? ""),
      details: collectText(entry.details)
    }));
    return {
      status: String(jobNode.status ?? ""),
      result: String(jobNode.result ?? ""),
      details: collectText(jobNode.details),
      devices: deviceEntries
    };
  };

  const waitForJob = async (jobId: string): Promise<TPanOsJob> => {
    const deadline = Date.now() + PAN_OS_JOB_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const job = parseJob(await op(`<show><jobs><id>${jobId}</id></jobs></show>`));
      if (job.status === "FIN" && !job.devices.some((device) => device.result === "PEND")) {
        return job;
      }
      await delay(PAN_OS_JOB_POLL_INTERVAL_MS);
    }
    throw new PanOsApiError(`PAN-OS job ${jobId} did not finish within ${PAN_OS_JOB_TIMEOUT_MS / 60_000} minutes`);
  };

  const startCommit = async (params: Record<string, string>): Promise<string | undefined> => {
    const response = await call({ type: "commit", ...params });
    const jobId = collectText((response.result as { job?: unknown } | undefined)?.job)[0];
    if (jobId && JOB_ID_PATTERN.test(jobId)) return jobId;
    if (NO_CHANGES_PATTERN.test(getResponseMessage(response))) return undefined;
    throw new PanOsApiError(`PAN-OS did not return a commit job: ${getResponseMessage(response)}`);
  };

  return {
    username: credentials.username,
    op,
    getConfig: getConfigNode,
    editConfig: (xpath: string, element: string) => call({ type: "config", action: "edit", xpath, element }),
    deleteConfig: (xpath: string) => call({ type: "config", action: "delete", xpath }),
    importFile: (params: Record<string, string>, fileName: string, content: string) => {
      const form = new FormData();
      form.append("file", new Blob([content], { type: "application/x-pem-file" }), fileName);
      return send(form, { "X-PAN-KEY": apiKey }, new URLSearchParams(params));
    },
    startCommit,
    waitForJob
  };
};

export type TPanOsClient = Awaited<ReturnType<typeof createPanOsClient>>;

export const isPanorama = async (client: TPanOsClient) => {
  const result = await client.op("<show><system><info></info></system></show>");
  const model = collectText((result.system as TPanOsXmlNode | undefined)?.model)[0] ?? "";
  return model === "Panorama" || model.startsWith("M-");
};

const getEntryNames = (node: unknown): string[] =>
  getEntries(node)
    .map((entry) => String(entry["@_name"] ?? ""))
    .filter(Boolean);

export const listPanoramaTemplates = async (client: TPanOsClient) => {
  const result = await client.getConfig(`/config/devices/${PAN_OS_LOCALHOST_ENTRY}/template`);
  return getEntryNames(result.template);
};

export const getConfigRoot = (template?: string) =>
  template ? `/config/devices/${PAN_OS_LOCALHOST_ENTRY}/template/entry[@name='${template}']/config` : "/config";

export const listSslTlsServiceProfiles = async (client: TPanOsClient, template?: string) => {
  const root = getConfigRoot(template);
  const [sharedResult, vsysResult] = await Promise.all([
    client.getConfig(`${root}/shared/ssl-tls-service-profile`),
    client.getConfig(`${root}/devices/${PAN_OS_LOCALHOST_ENTRY}/vsys`)
  ]);

  const profiles: Array<{ name: string; vsys: string | null }> = getEntryNames(
    sharedResult["ssl-tls-service-profile"]
  ).map((name) => ({ name, vsys: null }));

  getEntries(vsysResult.vsys).forEach((vsys) => {
    getEntryNames(vsys["ssl-tls-service-profile"]).forEach((name) =>
      profiles.push({ name, vsys: String(vsys["@_name"]) })
    );
  });

  return profiles;
};

const UNTRUSTED_TLS_CODES = new Set([
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "CERT_HAS_EXPIRED",
  "ERR_TLS_CERT_ALTNAME_INVALID"
]);

const UNTRUSTED_TLS_PATTERN = new RE2(
  "self[- ]signed certificate|unable to verify the first certificate|unable to get local issuer|certificate has expired|altnames",
  "i"
);
const GATEWAY_TRANSPORT_PATTERN = new RE2("gateway mTLS", "i");
const UNREACHABLE_PATTERN = new RE2(
  [...RETRYABLE_NETWORK_ERRORS, "socket disconnected before secure TLS connection", "socket hang up"].join("|"),
  "i"
);

export const describePanOsError = (error: unknown) => {
  if (error instanceof PanOsApiError) return error.message;
  const code = (error as { code?: string })?.code;
  const detail = error instanceof Error ? error.message : "Unknown error";
  if (error instanceof GatewayTransportError || GATEWAY_TRANSPORT_PATTERN.test(detail)) {
    return "the gateway could not be reached. Check that the gateway is running and connected to its relay.";
  }
  if ((code && UNTRUSTED_TLS_CODES.has(code)) || UNTRUSTED_TLS_PATTERN.test(detail)) {
    return `the management interface's TLS certificate is not trusted (${detail}). Add its CA certificate in the connection's SSL settings, or turn off Reject Unauthorized.`;
  }
  if (code === "ECONNABORTED") return "the request to PAN-OS timed out";
  if (UNREACHABLE_PATTERN.test(`${code ?? ""} ${detail}`)) {
    return `the management interface could not be reached (${detail}). Check the hostname and port, and that HTTPS management access is allowed from Infisical or the gateway.`;
  }
  return detail;
};

export const withPanOsClient = async <T>(
  connection: Pick<TPaloAltoNetworksConnection, "credentials" | "gatewayId" | "gatewayPoolId">,
  {
    gatewayV2Service,
    gatewayPoolService
  }: {
    gatewayV2Service?: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
    gatewayPoolService?: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">;
  },
  operation: (client: TPanOsClient) => Promise<T>
): Promise<T> => {
  const gatewayId = gatewayPoolService
    ? await gatewayPoolService.resolveEffectiveGatewayId({
        gatewayId: connection.gatewayId,
        gatewayPoolId: connection.gatewayPoolId
      })
    : (connection.gatewayId ?? null);

  return executePaloAltoNetworksOperationWithGateway(
    { gatewayId, credentials: connection.credentials },
    gatewayV2Service,
    async (makeRequest) => operation(await createPanOsClient(connection.credentials, makeRequest))
  );
};

export const validatePaloAltoNetworksConnectionCredentials = async (
  config: TPaloAltoNetworksConnectionConfig,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">
) => {
  try {
    await withPanOsClient(config, { gatewayV2Service }, isPanorama);
  } catch (error: unknown) {
    throw new BadRequestError({
      message: `Unable to validate connection: ${describePanOsError(error)}`
    });
  }

  return config.credentials;
};
