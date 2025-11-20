import { AxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError } from "@app/lib/errors";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";

import { DNSMadeEasyConnectionMethod } from "./dns-made-easy-connection-enum";
import {
  TDNSMadeEasyConnection,
  TDNSMadeEasyConnectionConfig,
  TDNSMadeEasyZone
} from "./dns-made-easy-connection-types";

interface DNSMadeEasyApiResponse {
  totalRecords: number;
  totalPages: number;
  data: Array<{
    id: number;
    name: string;
    [key: string]: unknown;
  }>;
  page: number;
}

export const makeDNSMadeEasyAuthHeaders = (
  apiKey: string,
  secretKey: string,
  currentDate: Date = new Date()
): Record<string, string> => {
  // Format date as "Day, DD Mon YYYY HH:MM:SS GMT" (e.g., "Mon, 01 Jan 2024 12:00:00 GMT")
  const requestDate = currentDate.toUTCString();

  // Generate HMAC-SHA1 signature
  const hmac = crypto.nativeCrypto.createHmac("sha1", secretKey);
  hmac.update(requestDate);
  const hmacSignature = hmac.digest("hex");

  return {
    "x-dnsme-apiKey": apiKey,
    "x-dnsme-hmac": hmacSignature,
    "x-dnsme-requestDate": requestDate
  };
};

export const getDNSMadeEasyConnectionListItem = () => {
  return {
    name: "DNS Made Easy" as const,
    app: AppConnection.DNSMadeEasy as const,
    methods: Object.values(DNSMadeEasyConnectionMethod) as [DNSMadeEasyConnectionMethod.APIKeySecret]
  };
};

export const listDNSMadeEasyZones = async (appConnection: TDNSMadeEasyConnection): Promise<TDNSMadeEasyZone[]> => {
  // TODO: Implement DNS Made Easy zones listing
  // This should call the DNS Made Easy API to list all zones/domains
  // Example API endpoint: GET https://api.dnsmadeeasy.com/V2.0/dns/managed
  // Authentication: Use API key and secret from appConnection.credentials
  // Return format: Array of { id: string, name: string }

  if (appConnection.method !== DNSMadeEasyConnectionMethod.APIKeySecret) {
    throw new Error("Unsupported DNS Made Easy connection method");
  }

  const {
    credentials: { apiKey, secretKey }
  } = appConnection;

  try {
    // TODO:
    const allZones: TDNSMadeEasyZone[] = [];
    return allZones;
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        message: `Failed to list DNS Made Easy zones: ${error.response?.data?.error?.[0] || error.message || "Unknown error"}`
      });
    }
    throw new BadRequestError({
      message: "Unable to list DNS Made Easy zones"
    });
  }
};

export const validateDNSMadeEasyConnectionCredentials = async (config: TDNSMadeEasyConnectionConfig) => {
  if (config.method !== DNSMadeEasyConnectionMethod.APIKeySecret) {
    throw new Error("Unsupported DNS Made Easy connection method");
  }

  const { apiKey, secretKey } = config.credentials;

  try {
    const resp = await request.get(`${IntegrationUrls.DNS_MADE_EASY_API_URL}/V2.0/dns/managed/`, {
      headers: {
        ...makeDNSMadeEasyAuthHeaders(apiKey, secretKey),
        Accept: "application/json"
      }
    });
    if (resp.status !== 200) {
      throw new BadRequestError({
        message: "Unable to validate connection: Invalid API credentials provided."
      });
    }
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        message: `Failed to validate credentials: ${error.response?.data?.error?.[0] || error.message || "Unknown error"}`
      });
    }
    throw new BadRequestError({
      message: "Unable to validate connection: verify credentials"
    });
  }

  return config.credentials;
};
