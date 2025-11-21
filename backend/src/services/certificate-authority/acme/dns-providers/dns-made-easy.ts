import axios from "axios";

import { request } from "@app/lib/config/request";
import { logger } from "@app/lib/logger";
import {
  getDNSMadeEasyUrl,
  makeDNSMadeEasyAuthHeaders
} from "@app/services/app-connection/dns-made-easy/dns-made-easy-connection-fns";
import { TDNSMadeEasyConnection } from "@app/services/app-connection/dns-made-easy/dns-made-easy-connection-types";

export const dnsMadeEasyInsertTxtRecord = async (
  connection: TDNSMadeEasyConnection,
  hostedZoneId: string,
  domain: string,
  value: string
) => {
  const {
    credentials: { apiKey, secretKey }
  } = connection;

  logger.info({ hostedZoneId, domain, value }, "Inserting TXT record for DNS Made Easy");
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

      if (error.status === 400 && error.message.includes("already exists")) {
        logger.info({ domain, value }, `Record already exists for domain: ${domain} and value: ${value}`);
        return;
      }

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

  logger.info({ hostedZoneId, domain, value }, "Deleting TXT record for DNS Made Easy");
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
