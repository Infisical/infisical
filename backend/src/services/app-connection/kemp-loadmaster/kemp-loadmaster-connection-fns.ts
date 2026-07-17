import { AxiosError, AxiosRequestConfig } from "axios";
import { XMLParser } from "fast-xml-parser";
import https from "https";

import { TGatewayServiceFactory } from "@app/ee/services/gateway/gateway-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { getConfig } from "@app/lib/config/env";
import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { GatewayProxyProtocol } from "@app/lib/gateway";
import { withGatewayV2Proxy } from "@app/lib/gateway-v2/gateway-v2";
import { safeRequest } from "@app/lib/validator";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { KempLoadMasterConnectionMethod } from "./kemp-loadmaster-connection-enums";
import { TKempLoadMasterConnectionConfig } from "./kemp-loadmaster-connection-types";

export const KEMP_LOADMASTER_DEFAULT_PORT = 8443;

type TKempCredentials = TKempLoadMasterConnectionConfig["credentials"];

export type TKempRequestFn = <R>(requestCfg: AxiosRequestConfig) => Promise<R>;

export type TKempParsedResponse = {
  ok: boolean;
  stat: string;
  code: string;
  error?: string;
  data?: unknown;
};

const kempXmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

export const parseKempResponse = (payload: unknown): TKempParsedResponse => {
  const parsed: unknown = typeof payload === "string" ? kempXmlParser.parse(payload) : payload;
  const response = (parsed as { Response?: Record<string, unknown> })?.Response;

  const stat = response?.["@_stat"] !== undefined ? String(response["@_stat"]) : "";
  const code = response?.["@_code"] !== undefined ? String(response["@_code"]) : "";
  const error = response?.Error !== undefined ? String(response.Error) : undefined;
  const data = (response?.Success as { Data?: unknown })?.Data;

  return { ok: stat === "200" && code === "ok", stat, code, error, data };
};

export const getKempBaseUrl = (credentials: TKempCredentials): string =>
  `https://${credentials.hostname}:${credentials.port ?? KEMP_LOADMASTER_DEFAULT_PORT}`;

export const getKempAuthHeaders = (credentials: TKempCredentials): Record<string, string> => {
  const token = Buffer.from(`${credentials.username}:${credentials.password}`).toString("base64");
  return { Authorization: `Basic ${token}` };
};

export const getKempLoadMasterConnectionListItem = () => {
  return {
    name: "Kemp LoadMaster" as const,
    app: AppConnection.KempLoadMaster as const,
    methods: Object.values(KempLoadMasterConnectionMethod) as [KempLoadMasterConnectionMethod.BasicAuth]
  };
};

export const executeKempLoadMasterOperationWithGateway = async <T>(
  config: {
    gatewayId?: string | null;
    credentials: TKempCredentials;
  },
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId"> | undefined,
  operation: (makeRequest: TKempRequestFn) => Promise<T>
): Promise<T> => {
  const { gatewayId, credentials } = config;
  const { hostname, port: credPort } = credentials;
  const port = credPort ?? KEMP_LOADMASTER_DEFAULT_PORT;

  if (gatewayId && gatewayV2Service) {
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

  const makeRequest = async <R>(requestCfg: AxiosRequestConfig): Promise<R> => {
    const resp = await safeRequest.request<R>({
      ...requestCfg,
      url: requestCfg.url as string,
      ca: credentials.sslCertificate,
      rejectUnauthorized: credentials.sslRejectUnauthorized,
      servername: hostname,
      allowPrivateIps: getConfig().ALLOW_INTERNAL_IP_CONNECTIONS
    });
    return resp.data;
  };

  return operation(makeRequest);
};

export type TKempVirtualService = {
  id: string;
  name: string;
  address: string;
  port: number;
  protocol: string;
};

export const listKempVirtualServices = async (
  config: {
    gatewayId?: string | null;
    credentials: TKempCredentials;
  },
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId"> | undefined
): Promise<TKempVirtualService[]> => {
  const baseUrl = getKempBaseUrl(config.credentials);

  return executeKempLoadMasterOperationWithGateway(config, gatewayV2Service, async (makeRequest) => {
    const payload = await makeRequest<string>({
      method: "GET",
      url: `${baseUrl}/access/listvs`,
      headers: getKempAuthHeaders(config.credentials),
      responseType: "text"
    });

    const parsed = parseKempResponse(payload);
    if (!parsed.ok) {
      throw new BadRequestError({
        message: `Unable to list Virtual Services: ${parsed.error || "the LoadMaster rejected the request"}`
      });
    }

    const data = parsed.data as { VS?: unknown } | undefined;
    if (!data?.VS) return [];

    const entries = Array.isArray(data.VS) ? data.VS : [data.VS];
    return entries
      .map((entry) => {
        const vs = entry as Record<string, unknown>;
        const index = vs.Index !== undefined && vs.Index !== null ? String(vs.Index) : "";
        return {
          id: index,
          name: vs.NickName !== undefined && vs.NickName !== null ? String(vs.NickName) : "",
          address: vs.VSAddress !== undefined && vs.VSAddress !== null ? String(vs.VSAddress) : "",
          port: vs.VSPort !== undefined && vs.VSPort !== null ? Number(vs.VSPort) : 0,
          protocol: vs.Protocol !== undefined && vs.Protocol !== null ? String(vs.Protocol) : ""
        };
      })
      .filter((vs) => vs.id !== "");
  });
};

export const validateKempLoadMasterConnectionCredentials = async (
  config: TKempLoadMasterConnectionConfig,
  _gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">
) => {
  const { credentials } = config;
  const baseUrl = getKempBaseUrl(credentials);

  try {
    await executeKempLoadMasterOperationWithGateway(
      { gatewayId: config.gatewayId, credentials },
      gatewayV2Service,
      async (makeRequest) => {
        const payload = await makeRequest<string>({
          method: "GET",
          url: `${baseUrl}/access/listcert`,
          headers: getKempAuthHeaders(credentials),
          responseType: "text"
        });

        const parsed = parseKempResponse(payload);
        if (!parsed.ok) {
          throw new BadRequestError({
            message: `Unable to validate connection: ${parsed.error || "the LoadMaster rejected the request"}`
          });
        }
      }
    );
  } catch (error: unknown) {
    if (error instanceof BadRequestError) {
      throw error;
    }

    if (error instanceof AxiosError) {
      if (error.response?.status === 401) {
        throw new BadRequestError({ message: "Unable to validate connection: invalid username or password" });
      }
      if (error.response?.status === 404) {
        throw new BadRequestError({
          message:
            "Unable to validate connection: the LoadMaster API interface is not enabled. Enable it under Certificates & Security > Remote Access > Enable API Interface."
        });
      }
    }

    throw new BadRequestError({
      message: `Unable to validate connection: ${
        error instanceof Error ? error.message : "verify credentials and that the LoadMaster is reachable"
      }`
    });
  }

  return config.credentials;
};
