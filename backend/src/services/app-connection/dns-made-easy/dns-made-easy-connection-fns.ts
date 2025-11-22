import { AxiosError } from "axios";

import { getConfig } from "@app/lib/config/env";
import { request } from "@app/lib/config/request";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
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
    type: string;
    value: string;
  }>;
  page: number;
}

export const getDNSMadeEasyUrl = (path: string) => {
  const appCfg = getConfig();
  return `${appCfg.DNS_MADE_EASY_SANDBOX_ENABLED ? IntegrationUrls.DNS_MADE_EASY_SANDBOX_API_URL : IntegrationUrls.DNS_MADE_EASY_API_URL}${path}`;
};

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
  if (appConnection.method !== DNSMadeEasyConnectionMethod.APIKeySecret) {
    throw new Error("Unsupported DNS Made Easy connection method");
  }

  const {
    credentials: { apiKey, secretKey }
  } = appConnection;

  try {
    const allZones: TDNSMadeEasyZone[] = [];
    let currentPage = 0;
    let totalPages = 1;

    // Fetch all pages of zones
    while (currentPage < totalPages) {
      // eslint-disable-next-line no-await-in-loop
      const resp = await request.get<DNSMadeEasyApiResponse>(getDNSMadeEasyUrl("/V2.0/dns/managed/"), {
        headers: {
          ...makeDNSMadeEasyAuthHeaders(apiKey, secretKey),
          Accept: "application/json"
        },
        params: {
          page: currentPage
        }
      });

      if (resp.data?.data) {
        // Map the API response to TDNSMadeEasyZone format
        const zones = resp.data.data.map((zone) => ({
          id: String(zone.id),
          name: zone.name
        }));
        allZones.push(...zones);

        // Update pagination info
        totalPages = resp.data.totalPages || 1;
        currentPage += 1;
      } else {
        break;
      }
    }

    return allZones;
  } catch (error: unknown) {
    logger.error(error, "Error listing DNS Made Easy zones");
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

export const listDNSMadeEasyRecords = async (
  appConnection: TDNSMadeEasyConnection,
  options: { zoneId: string; type?: string; name?: string }
): Promise<DNSMadeEasyApiResponse["data"]> => {
  if (appConnection.method !== DNSMadeEasyConnectionMethod.APIKeySecret) {
    throw new Error("Unsupported DNS Made Easy connection method");
  }
  const {
    credentials: { apiKey, secretKey }
  } = appConnection;
  const { zoneId, type, name } = options;

  try {
    const allRecords: DNSMadeEasyApiResponse["data"] = [];
    let currentPage = 0;
    let totalPages = 1;

    // Fetch all pages of records
    while (currentPage < totalPages) {
      // Build query parameters
      const queryParams: Record<string, string | number> = {};
      if (type) {
        queryParams.type = type;
      }
      if (name) {
        queryParams.recordName = name;
      }
      queryParams.page = currentPage;

      // eslint-disable-next-line no-await-in-loop
      const resp = await request.get<DNSMadeEasyApiResponse>(
        getDNSMadeEasyUrl(`/V2.0/dns/managed/${encodeURIComponent(zoneId)}/records`),
        {
          headers: {
            ...makeDNSMadeEasyAuthHeaders(apiKey, secretKey),
            Accept: "application/json"
          },
          params: queryParams
        }
      );

      if (resp.data?.data) {
        allRecords.push(...resp.data.data);

        // Update pagination info
        totalPages = resp.data.totalPages || 1;
        currentPage += 1;
      } else {
        break;
      }
    }

    return allRecords;
  } catch (error: unknown) {
    logger.error(error, "Error listing DNS Made Easy records");
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        message: `Failed to list DNS Made Easy records: ${error.response?.data?.error?.[0] || error.message || "Unknown error"}`
      });
    }
    throw new BadRequestError({
      message: "Unable to list DNS Made Easy records"
    });
  }
};

export const validateDNSMadeEasyConnectionCredentials = async (config: TDNSMadeEasyConnectionConfig) => {
  if (config.method !== DNSMadeEasyConnectionMethod.APIKeySecret) {
    throw new Error("Unsupported DNS Made Easy connection method");
  }

  const { apiKey, secretKey } = config.credentials;

  try {
    const resp = await request.get(getDNSMadeEasyUrl("/V2.0/dns/managed/"), {
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
    logger.error(error, "Error validating DNS Made Easy connection credentials");
    throw new BadRequestError({
      message: "Unable to validate connection: verify credentials"
    });
  }

  return config.credentials;
};
