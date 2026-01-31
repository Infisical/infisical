/* eslint-disable no-await-in-loop */
import axios from "axios";

import { request } from "@app/lib/config/request";
import { TCloudflareConnectionConfig } from "@app/services/app-connection/cloudflare/cloudflare-connection-types";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";

export const cloudflareInsertTxtRecord = async (
  connection: TCloudflareConnectionConfig,
  hostedZoneId: string,
  domain: string,
  value: string
) => {
  const {
    credentials: { apiToken }
  } = connection;

  try {
    await request.post(
      `${IntegrationUrls.CLOUDFLARE_API_URL}/client/v4/zones/${encodeURIComponent(hostedZoneId)}/dns_records`,
      {
        type: "TXT",
        name: domain,
        content: value,
        ttl: 60,
        proxied: false
      },
      {
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
          Accept: "application/json"
        }
      }
    );
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const firstErrorMessage = (
        error.response?.data as {
          errors?: { message: string }[];
        }
      )?.errors?.[0]?.message;
      if (firstErrorMessage) {
        throw new Error(firstErrorMessage);
      }
    }
    throw error;
  }
};

export const cloudflareDeleteTxtRecord = async (
  connection: TCloudflareConnectionConfig,
  hostedZoneId: string,
  domain: string,
  value: string
) => {
  const {
    credentials: { apiToken }
  } = connection;

  const maxRetries = 3;
  const initialDelay = 3000;
  let retryCount = 0;
  let lastError: Error | null = null;

  while (retryCount < maxRetries) {
    try {
      const listRecordsResponse = await request.get<{
        result: { id: string; type: string; name: string; content: string }[];
      }>(`${IntegrationUrls.CLOUDFLARE_API_URL}/client/v4/zones/${encodeURIComponent(hostedZoneId)}/dns_records`, {
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        params: {
          type: "TXT",
          name: domain,
          content: value
        }
      });

      const dnsRecords = listRecordsResponse.data?.result;

      if (Array.isArray(dnsRecords) && dnsRecords.length > 0) {
        const recordToDelete = dnsRecords.find(
          (record) => record.type === "TXT" && record.name === domain && record.content === value
        );

        if (recordToDelete) {
          await request.delete(
            `${IntegrationUrls.CLOUDFLARE_API_URL}/client/v4/zones/${encodeURIComponent(hostedZoneId)}/dns_records/${recordToDelete.id}`,
            {
              headers: {
                Authorization: `Bearer ${apiToken}`,
                "Content-Type": "application/json",
                Accept: "application/json"
              }
            }
          );
          // Successfully deleted the record
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
      const firstErrorMessage = (
        lastError.response?.data as {
          errors?: { message: string }[];
        }
      )?.errors?.[0]?.message;
      if (firstErrorMessage) {
        throw new Error(firstErrorMessage);
      }
    }
    throw lastError;
  }
};
