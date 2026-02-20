import { createHmac } from "crypto";
import { randomUUID } from "crypto";

import { AxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { AlibabaCloudConnectionMethod } from "./alibaba-cloud-connection-enums";
import { TAlibabaCloudConnectionConfig } from "./alibaba-cloud-connection-types";

const KMS_API_VERSION = "2016-01-20";

// RFC 3986 percent-encode (stricter than encodeURIComponent)
const encodeRfc3986 = (str: string): string =>
  encodeURIComponent(str)
    .replace(/!/g, "%21")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29")
    .replace(/\*/g, "%2A");

export const buildAlibabaCloudKmsParams = (
  action: string,
  accessKeyId: string,
  accessKeySecret: string,
  additionalParams: Record<string, string> = {}
): Record<string, string> => {
  const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const nonce = randomUUID().replace(/-/g, "");

  const params: Record<string, string> = {
    Action: action,
    Format: "JSON",
    Version: KMS_API_VERSION,
    AccessKeyId: accessKeyId,
    SignatureMethod: "HMAC-SHA1",
    SignatureVersion: "1.0",
    SignatureNonce: nonce,
    Timestamp: timestamp,
    ...additionalParams
  };

  // Build canonicalized query string: sort keys, encode key=value, join with &
  const canonicalized = Object.keys(params)
    .sort()
    .map((k) => `${encodeRfc3986(k)}=${encodeRfc3986(params[k])}`)
    .join("&");

  // StringToSign = HTTPMethod & encode("/") & encode(canonicalized)
  const stringToSign = `GET&${encodeRfc3986("/")}&${encodeRfc3986(canonicalized)}`;

  const hmac = createHmac("sha1", `${accessKeySecret}&`);
  hmac.update(stringToSign, "utf8");
  const signature = hmac.digest("base64");

  return { ...params, Signature: signature };
};

export const getAlibabaCloudKmsEndpoint = (regionId: string): string =>
  `https://kms.${regionId}.aliyuncs.com/`;

export const getAlibabaCloudConnectionListItem = () => ({
  name: "Alibaba Cloud KMS" as const,
  app: AppConnection.AlibabaCloud as const,
  methods: Object.values(AlibabaCloudConnectionMethod) as [AlibabaCloudConnectionMethod.AccessKey]
});

export const validateAlibabaCloudConnectionCredentials = async (config: TAlibabaCloudConnectionConfig) => {
  if (config.method !== AlibabaCloudConnectionMethod.AccessKey) {
    throw new BadRequestError({ message: "Unsupported Alibaba Cloud connection method" });
  }

  const { accessKeyId, accessKeySecret, regionId } = config.credentials;
  const endpoint = getAlibabaCloudKmsEndpoint(regionId);

  const params = buildAlibabaCloudKmsParams("ListSecrets", accessKeyId, accessKeySecret, {
    PageNumber: "1",
    PageSize: "1"
  });

  try {
    const resp = await request.get(endpoint, { params });
    if (resp.status !== 200) {
      throw new BadRequestError({ message: "Unable to validate connection: Invalid credentials." });
    }
  } catch (error) {
    if (error instanceof BadRequestError) throw error;
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to validate credentials: ${
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          (error.response?.data as { Message?: string })?.Message || error.message || "Unknown error"
        }`
      });
    }
    throw new BadRequestError({ message: "Unable to validate connection: verify credentials" });
  }

  return config.credentials;
};
