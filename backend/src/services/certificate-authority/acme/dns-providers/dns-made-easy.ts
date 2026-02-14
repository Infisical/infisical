/* eslint-disable no-await-in-loop */
import axios from "axios";

import { request } from "@app/lib/config/request";
import { logger } from "@app/lib/logger";
import {
  getDNSMadeEasyUrl,
  listDNSMadeEasyRecords,
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

  // Retry with exponential backoff to handle propagation delay and transient errors
  const maxRetries = 3;
  const initialDelay = 3000;
  let retryCount = 0;
  let lastError: Error | null = null;

  while (retryCount < maxRetries) {
    try {
      logger.info({ hostedZoneId, domain, value }, "Deleting TXT record for DNS Made Easy");
      const dnsRecords = await listDNSMadeEasyRecords(connection, { zoneId: hostedZoneId, type: "TXT", name: domain });

      if (dnsRecords.length > 0) {
        const recordToDelete = dnsRecords.find(
          (record) => record.type === "TXT" && record.name === domain && record.value === value
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
          return;
        }
      }

      // Record not found - might not have propagated yet, retry with backoff
      retryCount += 1;
      if (retryCount < maxRetries) {
        const delay = initialDelay * 2 ** (retryCount - 1);
        await new Promise((resolve) => {
          setTimeout(resolve, delay);
        });
      }
    } catch (error) {
      lastError = error as Error;
      retryCount += 1;

      if (retryCount < maxRetries) {
        const delay = initialDelay * 2 ** (retryCount - 1);
        await new Promise((resolve) => {
          setTimeout(resolve, delay);
        });
      }
    }
  }

  if (lastError) {
    if (axios.isAxiosError(lastError)) {
      const errorMessage =
        (lastError.response?.data as { error?: string[] | string })?.error?.[0] ||
        (lastError.response?.data as { error?: string[] | string })?.error ||
        lastError.message ||
        "Unknown error";
      throw new Error(typeof errorMessage === "string" ? errorMessage : String(errorMessage));
    }
    throw lastError;
  }

  logger.warn({ hostedZoneId, domain, value }, "Record to delete not found after retries");
};
