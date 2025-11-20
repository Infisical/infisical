import { AxiosError } from "axios";
import crypto from "crypto";

import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { removeTrailingSlash } from "@app/lib/fn";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";
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

export const getChefServerUrl = async (serverUrl?: string) => {
  const chefServerUrl = serverUrl ? removeTrailingSlash(serverUrl) : IntegrationUrls.CHEF_API_URL;

  await blockLocalAndPrivateIpAddresses(chefServerUrl);

  return chefServerUrl;
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

export const getChefConnectionListItem = () => {
  return {
    name: "Chef" as const,
    app: AppConnection.Chef as const,
    methods: Object.values(ChefConnectionMethod) as [ChefConnectionMethod.UserKey]
  };
};

export const validateChefConnectionCredentials = async (config: TChefConnectionConfig) => {
  const { credentials: inputCredentials } = config;

  try {
    const path = `/organizations/${inputCredentials.orgName}/users/${inputCredentials.userName}`;

    const hostServerUrl = await getChefServerUrl(inputCredentials.serverUrl);

    const headers = getChefAuthHeaders("GET", path, "", inputCredentials.userName, inputCredentials.privateKey);

    const secureUrl = buildSecureUrl(hostServerUrl, path);
    await request.get(secureUrl, {
      headers
    });
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
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

export const listChefDataBags = async (appConnection: TChefConnection): Promise<TChefDataBag[]> => {
  const {
    credentials: { serverUrl, userName, privateKey, orgName }
  } = appConnection;

  try {
    const path = `/organizations/${orgName}/data`;
    const body = "";

    const hostServerUrl = await getChefServerUrl(serverUrl);

    const headers = getChefAuthHeaders("GET", path, body, userName, privateKey);

    const secureUrl = buildSecureUrl(hostServerUrl, path);
    const res = await request.get<Record<string, string>>(secureUrl, {
      headers
    });

    return Object.keys(res.data).map((name) => ({
      name
    }));
  } catch (error) {
    if (error instanceof AxiosError) {
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
  appConnection: TChefConnection,
  dataBagName: string
): Promise<TChefDataBagItem[]> => {
  const {
    credentials: { serverUrl, userName, privateKey, orgName }
  } = appConnection;

  try {
    const path = `/organizations/${orgName}/data/${dataBagName}`;
    const body = "";

    const hostServerUrl = await getChefServerUrl(serverUrl);

    const headers = getChefAuthHeaders("GET", path, body, userName, privateKey);

    const secureUrl = buildSecureUrl(hostServerUrl, path);
    const res = await request.get<Record<string, string>>(secureUrl, {
      headers
    });

    return Object.keys(res.data).map((name) => ({
      name
    }));
  } catch (error) {
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to list Chef data bag items: ${error.message || "Unknown error"}`
      });
    }
    throw new BadRequestError({
      message: "Unable to list Chef data bag items"
    });
  }
};

export const getChefDataBagItem = async ({
  serverUrl,
  userName,
  privateKey,
  orgName,
  dataBagName,
  dataBagItemName
}: TGetChefDataBagItem): Promise<TChefDataBagItemContent> => {
  try {
    const path = `/organizations/${orgName}/data/${dataBagName}/${dataBagItemName}`;
    const body = "";

    const hostServerUrl = await getChefServerUrl(serverUrl);

    const headers = getChefAuthHeaders("GET", path, body, userName, privateKey);

    const secureUrl = buildSecureUrl(hostServerUrl, path);
    const res = await request.get<TChefDataBagItemContent>(secureUrl, {
      headers
    });

    return res.data;
  } catch (error) {
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to get Chef data bag item: ${error.message || "Unknown error"}`
      });
    }
    throw new BadRequestError({
      message: "Unable to get Chef data bag item"
    });
  }
};

export const createChefDataBagItem = async ({
  serverUrl,
  userName,
  privateKey,
  orgName,
  dataBagName,
  data
}: Omit<TUpdateChefDataBagItem, "dataBagItemName">): Promise<void> => {
  try {
    const path = `/organizations/${orgName}/data/${dataBagName}`;
    const body = JSON.stringify(data);

    const hostServerUrl = await getChefServerUrl(serverUrl);

    const headers = getChefAuthHeaders("POST", path, body, userName, privateKey);

    const secureUrl = buildSecureUrl(hostServerUrl, path);
    await request.post(secureUrl, data, {
      headers
    });
  } catch (error) {
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to create Chef data bag item: ${error.message || "Unknown error"}`
      });
    }
    throw new BadRequestError({
      message: "Unable to create Chef data bag item"
    });
  }
};

export const updateChefDataBagItem = async ({
  serverUrl,
  userName,
  privateKey,
  orgName,
  dataBagName,
  dataBagItemName,
  data
}: TUpdateChefDataBagItem): Promise<void> => {
  try {
    const path = `/organizations/${orgName}/data/${dataBagName}/${dataBagItemName}`;
    const body = JSON.stringify(data);

    const hostServerUrl = await getChefServerUrl(serverUrl);

    const headers = getChefAuthHeaders("PUT", path, body, userName, privateKey);

    const secureUrl = buildSecureUrl(hostServerUrl, path);
    await request.put(secureUrl, data, {
      headers
    });
  } catch (error) {
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to update Chef data bag item: ${error.message || "Unknown error"}`
      });
    }
    throw new BadRequestError({
      message: "Unable to update Chef data bag item"
    });
  }
};

export const removeChefDataBagItem = async ({
  serverUrl,
  userName,
  privateKey,
  orgName,
  dataBagName,
  dataBagItemName
}: Omit<TUpdateChefDataBagItem, "data">): Promise<void> => {
  try {
    const path = `/organizations/${orgName}/data/${dataBagName}/${dataBagItemName}`;
    const body = "";

    const hostServerUrl = await getChefServerUrl(serverUrl);

    const headers = getChefAuthHeaders("DELETE", path, body, userName, privateKey);

    const secureUrl = buildSecureUrl(hostServerUrl, path);
    await request.delete(secureUrl, {
      headers
    });
  } catch (error) {
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to remove Chef data bag item: ${error.message || "Unknown error"}`
      });
    }
    throw new BadRequestError({
      message: "Unable to remove Chef data bag item"
    });
  }
};
