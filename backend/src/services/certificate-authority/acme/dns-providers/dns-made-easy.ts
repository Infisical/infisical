import axios from "axios";

import { getConfig } from "@app/lib/config/env";
import { request } from "@app/lib/config/request";
import { crypto } from "@app/lib/crypto/cryptography";
import { TDNSMadeEasyConnection } from "@app/services/app-connection/dns-made-easy/dns-made-easy-connection-types";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";
import { logger } from "@app/lib/logger";

const getDNSMadeEasyUrl = (path: string) => {
  const appCfg = getConfig();
  return `${appCfg.DNS_MADE_EASY_SANDBOX_ENABLED ? IntegrationUrls.DNS_MADE_EASY_SANDBOX_API_URL : IntegrationUrls.DNS_MADE_EASY_API_URL}${path}`;
};

const makeDNSMadeEasyAuthHeaders = (
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

export const dnsMadeEasyInsertTxtRecord = async (
  connection: TDNSMadeEasyConnection,
  hostedZoneId: string,
  domain: string,
  value: string
) => {
  const {
    credentials: { apiKey, secretKey }
  } = connection;

  try {
    await request.post(
      getDNSMadeEasyUrl(`/V2.0/dns/managed/${encodeURIComponent(hostedZoneId)}/records`),
      {
        type: "TXT",
        name: domain,
        value,
        ttl: 60
      },
      {
        headers: {
          ...makeDNSMadeEasyAuthHeaders(apiKey, secretKey),
          "Content-Type": "application/json",
          Accept: "application/json"
        }
      }
    );
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const errorMessage =
        (error.response?.data as { error?: string[] | string })?.error?.[0] ||
        (error.response?.data as { error?: string[] | string })?.error ||
        error.message ||
        "Unknown error";
      throw new Error(typeof errorMessage === "string" ? errorMessage : String(errorMessage));
    }
    throw error;
  }
};

export const dnsMadeEasyDeleteTxtRecord = async (
  connection: TDNSMadeEasyConnection,
  hostedZoneId: string,
  domain: string,
  value: string
) => {
  const {
    credentials: { apiKey, secretKey }
  } = connection;

  try {
    // First, list records to find the record ID
    const listRecordsResponse = await request.get<{
      data: Array<{ id: number; type: string; name: string; value: string }>;
    }>(getDNSMadeEasyUrl(`/V2.0/dns/managed/${encodeURIComponent(hostedZoneId)}/records`), {
      headers: {
        ...makeDNSMadeEasyAuthHeaders(apiKey, secretKey),
        Accept: "application/json"
      },
      params: {
        type: "TXT",
        recordName: domain
      }
    });

    const dnsRecords = listRecordsResponse.data?.data;

    if (Array.isArray(dnsRecords) && dnsRecords.length > 0) {
      const recordToDelete = dnsRecords.find(
        (record) => record.type === "TXT" && record.name === domain && JSON.parse(record.value) === value
      );

      if (recordToDelete) {
        await request.delete(
          getDNSMadeEasyUrl(`/V2.0/dns/managed/${encodeURIComponent(hostedZoneId)}/records/${recordToDelete.id}`),
          {
            headers: {
              ...makeDNSMadeEasyAuthHeaders(apiKey, secretKey),
              Accept: "application/json"
            }
          }
        );
      } else {
        logger.warn({ domain, value }, `Record to delete not found for domain: ${domain} and value: ${value}`);
      }
    }
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const errorMessage =
        (error.response?.data as { error?: string[] | string })?.error?.[0] ||
        (error.response?.data as { error?: string[] | string })?.error ||
        error.message ||
        "Unknown error";
      throw new Error(typeof errorMessage === "string" ? errorMessage : String(errorMessage));
    }
    throw error;
  }
};
