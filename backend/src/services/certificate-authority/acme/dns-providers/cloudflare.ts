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
        // TODO: this is incorrect. The domain seems need to be fqdn, but we are passing just the record name here.
        //       as a result, we are not deleting the record correctly.
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
      }
    }
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
