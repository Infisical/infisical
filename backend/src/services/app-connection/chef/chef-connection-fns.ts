import { AxiosError } from "axios";
import crypto from "crypto";

import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { removeTrailingSlash } from "@app/lib/fn";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";

import { AppConnection } from "../app-connection-enums";
import { ChefConnectionMethod } from "./chef-connection-enums";
import { TChefConnection, TChefConnectionConfig, TChefDataBag } from "./chef-connection-types";

export const getChefServerUrl = async (serverUrl?: string) => {
  const chefServerUrl = serverUrl ? removeTrailingSlash(serverUrl) : IntegrationUrls.CHEF_API_URL;

  await blockLocalAndPrivateIpAddresses(chefServerUrl);

  return chefServerUrl;
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

// Chef API authentication helper
const getChefAuthHeaders = (
  method: string,
  path: string,
  body: string,
  userId: string,
  privateKey: string,
  timestamp: string
) => {
  const hashedPath = crypto.createHash("sha256").update(path).digest("base64");
  const hashedBody = crypto.createHash("sha256").update(body).digest("base64");

  console.log("1", {
    method,
    path,
    body,
    userId,
    privateKey,
    timestamp
  });
  const canonicalRequest = [
    `Method:${method}`,
    `Hashed Path:${hashedPath}`,
    `X-Ops-Content-Hash:${hashedBody}`,
    `X-Ops-Timestamp:${timestamp}`,
    `X-Ops-UserId:${userId}`
  ].join("\n");

  // Format the private key properly
  const formattedKey = formatPrivateKey(privateKey);

  console.log("Chef Auth Debug - Key format:", {
    formattedKey,
    hasHeader: formattedKey.includes("BEGIN"),
    keyType: formattedKey.match(/-----BEGIN ([^-]+)-----/)?.[1],
    keyLength: formattedKey.length,
    startsCorrectly: formattedKey.startsWith("-----BEGIN"),
    endsCorrectly: formattedKey.endsWith("-----")
  });

  // Create key object with proper format
  let keyObject;
  try {
    keyObject = crypto.createPrivateKey({
      key: Buffer.from(formattedKey),
      format: "pem"
    });
  } catch (error) {
    console.error("Failed to create private key:", error);
    console.error("Key preview (first 100 chars):", formattedKey.substring(0, 100));
    throw new Error(`Invalid private key format: ${error instanceof Error ? error.message : "Unknown error"}`);
  }

  // Sign using the key object with SHA-256 (FIPS-compliant)
  const signature = crypto.sign("sha256", Buffer.from(canonicalRequest), {
    key: keyObject,
    padding: crypto.constants.RSA_PKCS1_PADDING
  });

  const signatureBase64 = signature.toString("base64");

  console.log("4", { signature, signatureBase64 });

  // Split signature into 60 character chunks as required by Chef API
  const signatureLines: string[] = [];
  for (let i = 0; i < signatureBase64.length; i += 60) {
    signatureLines.push(signatureBase64.substring(i, i + 60));
  }

  console.log("5", signatureLines);
  const headers: Record<string, string> = {
    "X-Ops-Sign": "algorithm=sha256;version=1.3",
    "X-Ops-UserId": userId,
    "X-Ops-Timestamp": timestamp,
    "X-Ops-Content-Hash": hashedBody,
    "X-Chef-Version": "12.0.2",
    "X-Ops-Server-API-Version": "1"
  };

  console.log("6", headers);

  signatureLines.forEach((line, index) => {
    headers[`X-Ops-Authorization-${index + 1}`] = line;
  });

  console.log("7", headers);

  return headers;
};

export const getChefConnectionListItem = () => {
  return {
    name: "Chef" as const,
    app: AppConnection.Chef as const,
    methods: Object.values(ChefConnectionMethod) as [ChefConnectionMethod.UserKey]
  };
};

export const listChefDataBags = async (appConnection: TChefConnection): Promise<TChefDataBag[]> => {
  const {
    credentials: { serverUrl, userName, privateKey }
  } = appConnection;

  try {
    const path = "/data";
    const timestamp = `${new Date().toISOString().slice(0, -5)}Z`;
    const body = "";

    const hostServerUrl = await getChefServerUrl(serverUrl);

    const headers = getChefAuthHeaders("GET", path, body, userName, privateKey, timestamp);

    const res = await request.get<Record<string, string>>(`${hostServerUrl}${path}`, {
      headers: {
        ...headers,
        Accept: "application/json"
      }
    });

    // Chef returns data bags as an object with keys being data bag names
    return Object.keys(res.data).map((name) => ({
      name,
      id: name
    }));
  } catch (error) {
    if (error instanceof AxiosError) {
      // throw new BadRequestError({
      //   message: `Failed to list Chef data bags: ${error.response?.data?.error || error.message}`
      // });
    }
    throw new BadRequestError({
      message: "Unable to list Chef data bags"
    });
  }
};

export const validateChefConnectionCredentials = async (config: TChefConnectionConfig) => {
  const { credentials: inputCredentials } = config;

  try {
    const path = `/organizations/${inputCredentials.orgName}/users/${inputCredentials.userName}`;
    const timestamp = `${new Date().toISOString().slice(0, -5)}Z`;
    const body = "";

    const hostServerUrl = await getChefServerUrl(inputCredentials.serverUrl);

    console.log("Chef validate - attempting connection to:", hostServerUrl);
    const headers = getChefAuthHeaders(
      "GET",
      path,
      body,
      inputCredentials.userName,
      inputCredentials.privateKey,
      timestamp
    );

    const data = await request.get(`${hostServerUrl}${path}`, {
      headers: {
        ...headers,
        Accept: "application/json"
      }
    });
    console.log("Chef validate - data:", data);
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      const errorData = error.response?.data as { error?: string } | undefined;
      console.log("Chef validate - error:", errorData);
      throw new BadRequestError({
        message: `Failed to validate Chef credentials: ${errorData?.error || error.message || "Unknown error"}`
      });
    }
    throw new BadRequestError({
      message: "Unable to validate Chef connection: verify credentials"
    });
  }

  return inputCredentials;
};

export const listChefDataBagItems = async (
  appConnection: TChefConnection,
  dataBagName: string
): Promise<TChefDataBag[]> => {
  const {
    credentials: { serverUrl, userName, privateKey }
  } = appConnection;

  try {
    const path = `/data/${dataBagName}`;
    const timestamp = `${new Date().toISOString().slice(0, -5)}Z`;
    const body = "";

    const hostServerUrl = await getChefServerUrl(serverUrl);

    const headers = getChefAuthHeaders("GET", path, body, userName, privateKey, timestamp);

    const res = await request.get<Record<string, string>>(`${hostServerUrl}${path}`, {
      headers: {
        ...headers,
        Accept: "application/json"
      }
    });

    // Chef returns data bag items as an object with keys being item names
    return Object.keys(res.data).map((name) => ({
      name,
      id: name
    }));
  } catch (error) {
    if (error instanceof AxiosError) {
      // throw new BadRequestError({
      //   message: `Failed to list Chef data bag items: ${error.response?.data?.error || error.message}`
      // });
    }
    throw new BadRequestError({
      message: "Unable to list Chef data bag items"
    });
  }
};
