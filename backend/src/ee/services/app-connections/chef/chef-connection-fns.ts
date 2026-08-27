import { AxiosError, AxiosRequestConfig, AxiosResponse } from "axios";
import crypto from "crypto";
import https from "https";

import { TGatewayServiceFactory } from "@app/ee/services/gateway/gateway-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { getConfig } from "@app/lib/config/env";
import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { removeTrailingSlash } from "@app/lib/fn";
import { GatewayProxyProtocol } from "@app/lib/gateway";
import { withGatewayV2Proxy } from "@app/lib/gateway-v2/gateway-v2";
import { blockLocalAndPrivateIpAddresses, safeRequest } from "@app/lib/validator";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";

import { TChefDataBagItemContent } from "../../secret-sync/chef/chef-sync-types";
import { ChefConnectionMethod } from "./chef-connection-enums";
import {
  TChefConnection,
  TChefConnectionConfig,
  TChefDataBag,
  TChefDataBagItem,
  TGetChefDataBagItem,
  TUpdateChefDataBagItem
} from "./chef-connection-types";

const CHEF_REQUEST_TIMEOUT_MS = 30_000;
const CHEF_MAX_RESPONSE_BYTES = 10 * 1024 * 1024;

export const getChefServerUrl = (serverUrl?: string) => {
  return serverUrl ? removeTrailingSlash(serverUrl) : IntegrationUrls.CHEF_API_URL;
};

const buildSecureUrl = (baseUrl: string, path: string): string => {
  try {
    const url = new URL(path, baseUrl);
    return url.toString();
  } catch (error) {
    throw new BadRequestError({
      message: "Invalid URL construction parameters"
    });
  }
};

// Helper to ensure private key is in proper PEM format
const formatPrivateKey = (key: string): string => {
  let formattedKey = key.trim();

  // Ensure proper line breaks in PEM format (handle escaped newlines)
  formattedKey = formattedKey.replace(/\\n/g, "\n");

  // Remove any extra whitespace between lines
  formattedKey = formattedKey.replace(/\n\s+/g, "\n");

  // If key doesn't have headers, add PKCS#1 RSA headers
  if (!formattedKey.includes("BEGIN")) {
    formattedKey = `-----BEGIN RSA PRIVATE KEY-----\n${formattedKey}\n-----END RSA PRIVATE KEY-----`;
  }

  // Ensure the key has proper line breaks after headers and before footers
  formattedKey = formattedKey.replace(/(-----BEGIN[^-]+-----)\s*/g, "$1\n").replace(/\s*(-----END[^-]+-----)/g, "\n$1");

  // Remove any duplicate newlines
  formattedKey = formattedKey.replace(/\n{3,}/g, "\n\n");

  return formattedKey;
};

const getChefAuthHeaders = (
  method: string,
  path: string,
  body: string,
  userId: string,
  privateKey: string,
  apiVersion: "1.0" | "1.3" = "1.3"
) => {
  const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, "Z"); // Remove milliseconds from timestamp

  // Calculate content hash based on version
  let contentHash: string;
  if (apiVersion === "1.3") {
    contentHash = crypto.createHash("sha256").update(body).digest("base64");
  } else {
    contentHash = crypto.createHash("sha1").update(body).digest("base64");
  }

  // Build canonical request based on version
  let canonicalRequest: string;
  if (apiVersion === "1.3") {
    canonicalRequest = [
      `Method:${method}`,
      `Path:${path}`,
      `X-Ops-Content-Hash:${contentHash}`,
      "X-Ops-Sign:version=1.3",
      `X-Ops-Timestamp:${timestamp}`,
      `X-Ops-UserId:${userId}`,
      "X-Ops-Server-API-Version:1"
    ].join("\n");
  } else {
    const hashedPath = crypto.createHash("sha1").update(path).digest("base64");
    canonicalRequest = [
      `Method:${method}`,
      `Hashed Path:${hashedPath}`,
      `X-Ops-Content-Hash:${contentHash}`,
      `X-Ops-Timestamp:${timestamp}`,
      `X-Ops-UserId:${userId}`
    ].join("\n");
  }

  // Format the private key properly
  const formattedKey = formatPrivateKey(privateKey);

  // Sign the canonical request
  const sign = crypto.createSign(apiVersion === "1.3" ? "RSA-SHA256" : "RSA-SHA1");
  sign.update(canonicalRequest);
  const signature = sign.sign(formattedKey, "base64");

  // Split signature into 60-character chunks
  const authHeaders: Record<string, string> = {};
  const signatureLines = signature.match(/.{1,60}/g) || [];
  signatureLines.forEach((line, index) => {
    authHeaders[`X-Ops-Authorization-${index + 1}`] = line;
  });

  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-Chef-Version": "14.0.0",
    "X-Ops-Timestamp": timestamp,
    "X-Ops-UserId": userId,
    "X-Ops-Sign": apiVersion === "1.3" ? "version=1.3" : "algorithm=sha1;version=1.0",
    "X-Ops-Content-Hash": contentHash,
    ...(apiVersion === "1.3" && { "X-Ops-Server-API-Version": "1" }),
    ...authHeaders
  };
};

export const requestWithChefGateway = async <T>(
  gatewayId: string | null | undefined,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId"> | undefined,
  requestConfig: AxiosRequestConfig
): Promise<AxiosResponse<T>> => {
  const url = new URL(requestConfig.url as string);

  if (gatewayId && gatewayV2Service) {
    await blockLocalAndPrivateIpAddresses(url.toString(), true);

    const targetHost = url.hostname;
    // port is an empty string when the URL uses the protocol's default port (443 for https, 80 for http)
    // eslint-disable-next-line no-nested-ternary
    const targetPort = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;

    const platformConnectionDetails = await gatewayV2Service.getPlatformConnectionDetailsByGatewayId({
      gatewayId,
      targetHost,
      targetPort
    });

    if (!platformConnectionDetails) {
      throw new BadRequestError({ message: "Unable to connect to gateway, no platform connection details found" });
    }

    return withGatewayV2Proxy(
      async (proxyPort) => {
        const isHttps = url.protocol === "https:";
        url.host = `localhost:${proxyPort}`;

        const finalRequestConfig: AxiosRequestConfig = {
          ...requestConfig,
          url: url.toString(),
          headers: {
            ...requestConfig.headers,
            Host: targetHost
          },
          timeout: CHEF_REQUEST_TIMEOUT_MS,
          maxContentLength: CHEF_MAX_RESPONSE_BYTES,
          maxBodyLength: CHEF_MAX_RESPONSE_BYTES,
          ...(isHttps && {
            httpsAgent: new https.Agent({
              servername: targetHost
            })
          })
        };

        return request.request<T>(finalRequestConfig);
      },
      {
        protocol: GatewayProxyProtocol.Tcp,
        ...platformConnectionDetails
      }
    );
  }

  // safeRequest validates the URL and pins the connection to the validated IPs,
  // closing the DNS rebinding window between SSRF validation and connect
  return safeRequest.request<T>({
    ...requestConfig,
    url: requestConfig.url as string,
    allowPrivateIps: getConfig().ALLOW_INTERNAL_IP_CONNECTIONS,
    timeout: CHEF_REQUEST_TIMEOUT_MS,
    maxContentLength: CHEF_MAX_RESPONSE_BYTES,
    maxBodyLength: CHEF_MAX_RESPONSE_BYTES
  });
};

export const getChefConnectionListItem = () => {
  return {
    name: "Chef" as const,
    app: AppConnection.Chef as const,
    methods: Object.values(ChefConnectionMethod) as [ChefConnectionMethod.UserKey]
  };
};

export const validateChefConnectionCredentials = async (
  config: TChefConnectionConfig,
  _gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId"> | undefined
) => {
  const { credentials: inputCredentials, gatewayId } = config;

  try {
    const path = `/organizations/${inputCredentials.orgName}/users/${inputCredentials.userName}`;

    const hostServerUrl = getChefServerUrl(inputCredentials.serverUrl);

    const headers = getChefAuthHeaders("GET", path, "", inputCredentials.userName, inputCredentials.privateKey);

    const secureUrl = buildSecureUrl(hostServerUrl, path);
    await requestWithChefGateway(gatewayId, gatewayV2Service, {
      method: "GET",
      url: secureUrl,
      headers
    });
  } catch (error: unknown) {
    // withGatewayV2Proxy re-throws callback failures as BadRequestError, so wrap
    // both error types to preserve the Chef operation context in the message
    if (error instanceof AxiosError || error instanceof BadRequestError) {
      throw new BadRequestError({
        message: `Failed to validate Chef credentials: ${error.message || "Unknown error"}`
      });
    }
    throw new BadRequestError({
      message: "Unable to validate Chef connection: verify credentials"
    });
  }

  return inputCredentials;
};

export const listChefDataBags = async (
  appConnection: Pick<TChefConnection, "credentials" | "gatewayId">,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId"> | undefined
): Promise<TChefDataBag[]> => {
  const {
    credentials: { serverUrl, userName, privateKey, orgName },
    gatewayId
  } = appConnection;

  try {
    const path = `/organizations/${orgName}/data`;
    const body = "";

    const hostServerUrl = getChefServerUrl(serverUrl);

    const headers = getChefAuthHeaders("GET", path, body, userName, privateKey);

    const secureUrl = buildSecureUrl(hostServerUrl, path);
    const res = await requestWithChefGateway<Record<string, string>>(gatewayId, gatewayV2Service, {
      method: "GET",
      url: secureUrl,
      headers
    });

    return Object.keys(res.data).map((name) => ({
      name
    }));
  } catch (error) {
    if (error instanceof AxiosError || error instanceof BadRequestError) {
      throw new BadRequestError({
        message: `Failed to list Chef data bags: ${error.message || "Unknown error"}`
      });
    }
    throw new BadRequestError({
      message: "Unable to list Chef data bags"
    });
  }
};

export const listChefDataBagItems = async (
  appConnection: Pick<TChefConnection, "credentials" | "gatewayId">,
  dataBagName: string,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId"> | undefined
): Promise<TChefDataBagItem[]> => {
  const {
    credentials: { serverUrl, userName, privateKey, orgName },
    gatewayId
  } = appConnection;

  try {
    const path = `/organizations/${orgName}/data/${dataBagName}`;
    const body = "";

    const hostServerUrl = getChefServerUrl(serverUrl);

    const headers = getChefAuthHeaders("GET", path, body, userName, privateKey);

    const secureUrl = buildSecureUrl(hostServerUrl, path);
    const res = await requestWithChefGateway<Record<string, string>>(gatewayId, gatewayV2Service, {
      method: "GET",
      url: secureUrl,
      headers
    });

    return Object.keys(res.data).map((name) => ({
      name
    }));
  } catch (error) {
    if (error instanceof AxiosError || error instanceof BadRequestError) {
      throw new BadRequestError({
        message: `Failed to list Chef data bag items: ${error.message || "Unknown error"}`
      });
    }
    throw new BadRequestError({
      message: "Unable to list Chef data bag items"
    });
  }
};

export const getChefDataBagItem = async (
  { serverUrl, userName, privateKey, orgName, dataBagName, dataBagItemName, gatewayId }: TGetChefDataBagItem,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId"> | undefined
): Promise<TChefDataBagItemContent> => {
  try {
    const path = `/organizations/${orgName}/data/${dataBagName}/${dataBagItemName}`;
    const body = "";

    const hostServerUrl = getChefServerUrl(serverUrl);

    const headers = getChefAuthHeaders("GET", path, body, userName, privateKey);

    const secureUrl = buildSecureUrl(hostServerUrl, path);
    const res = await requestWithChefGateway<TChefDataBagItemContent>(gatewayId, gatewayV2Service, {
      method: "GET",
      url: secureUrl,
      headers
    });

    return res.data;
  } catch (error) {
    if (error instanceof AxiosError || error instanceof BadRequestError) {
      throw new BadRequestError({
        message: `Failed to get Chef data bag item: ${error.message || "Unknown error"}`
      });
    }
    throw new BadRequestError({
      message: "Unable to get Chef data bag item"
    });
  }
};

export const createChefDataBagItem = async (
  {
    serverUrl,
    userName,
    privateKey,
    orgName,
    dataBagName,
    data,
    gatewayId
  }: Omit<TUpdateChefDataBagItem, "dataBagItemName">,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId"> | undefined
): Promise<void> => {
  try {
    const path = `/organizations/${orgName}/data/${dataBagName}`;
    const body = JSON.stringify(data);

    const hostServerUrl = getChefServerUrl(serverUrl);

    const headers = getChefAuthHeaders("POST", path, body, userName, privateKey);

    const secureUrl = buildSecureUrl(hostServerUrl, path);
    await requestWithChefGateway(gatewayId, gatewayV2Service, {
      method: "POST",
      url: secureUrl,
      data,
      headers
    });
  } catch (error) {
    if (error instanceof AxiosError || error instanceof BadRequestError) {
      throw new BadRequestError({
        message: `Failed to create Chef data bag item: ${error.message || "Unknown error"}`
      });
    }
    throw new BadRequestError({
      message: "Unable to create Chef data bag item"
    });
  }
};

export const updateChefDataBagItem = async (
  { serverUrl, userName, privateKey, orgName, dataBagName, dataBagItemName, data, gatewayId }: TUpdateChefDataBagItem,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId"> | undefined
): Promise<void> => {
  try {
    const path = `/organizations/${orgName}/data/${dataBagName}/${dataBagItemName}`;
    const body = JSON.stringify(data);

    const hostServerUrl = getChefServerUrl(serverUrl);

    const headers = getChefAuthHeaders("PUT", path, body, userName, privateKey);

    const secureUrl = buildSecureUrl(hostServerUrl, path);
    await requestWithChefGateway(gatewayId, gatewayV2Service, {
      method: "PUT",
      url: secureUrl,
      data,
      headers
    });
  } catch (error) {
    if (error instanceof AxiosError || error instanceof BadRequestError) {
      throw new BadRequestError({
        message: `Failed to update Chef data bag item: ${error.message || "Unknown error"}`
      });
    }
    throw new BadRequestError({
      message: "Unable to update Chef data bag item"
    });
  }
};

export const removeChefDataBagItem = async (
  {
    serverUrl,
    userName,
    privateKey,
    orgName,
    dataBagName,
    dataBagItemName,
    gatewayId
  }: Omit<TUpdateChefDataBagItem, "data">,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId"> | undefined
): Promise<void> => {
  try {
    const path = `/organizations/${orgName}/data/${dataBagName}/${dataBagItemName}`;
    const body = "";

    const hostServerUrl = getChefServerUrl(serverUrl);

    const headers = getChefAuthHeaders("DELETE", path, body, userName, privateKey);

    const secureUrl = buildSecureUrl(hostServerUrl, path);
    await requestWithChefGateway(gatewayId, gatewayV2Service, {
      method: "DELETE",
      url: secureUrl,
      headers
    });
  } catch (error) {
    if (error instanceof AxiosError || error instanceof BadRequestError) {
      throw new BadRequestError({
        message: `Failed to remove Chef data bag item: ${error.message || "Unknown error"}`
      });
    }
    throw new BadRequestError({
      message: "Unable to remove Chef data bag item"
    });
  }
};
