import axios from "axios";

import { request } from "@app/lib/config/request";
import { logger } from "@app/lib/logger";
import {
  getAzureDnsAccessToken,
  validateAzureDnsZoneResourceId
} from "@app/services/app-connection/azure-dns/azure-dns-connection-fns";
import { TAzureDnsConnection } from "@app/services/app-connection/azure-dns/azure-dns-connection-types";

export const azureDnsInsertTxtRecord = async (
  connection: TAzureDnsConnection,
  hostedZoneId: string,
  recordName: string,
  value: string
) => {
  const {
    credentials: { tenantId, clientId, clientSecret }
  } = connection;

  validateAzureDnsZoneResourceId(hostedZoneId);

  try {
    const accessToken = await getAzureDnsAccessToken(tenantId, clientId, clientSecret);

    // e.g., /subscriptions/{subscriptionId}/resourceGroups/{resourceGroup}/providers/Microsoft.Network/dnsZones/{zoneName}
    await request.put(
      `https://management.azure.com${hostedZoneId}/TXT/${encodeURIComponent(recordName)}?api-version=2018-05-01`,
      {
        properties: {
          TTL: 60,
          TXTRecords: [{ value: [value.replace(/"/g, "")] }]
        }
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json"
        }
      }
    );
  } catch (error) {
    if (axios.isAxiosError(error)) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const errorMessage = (error.response?.data?.error?.message || error.message || "Unknown error") as string;
      throw new Error(typeof errorMessage === "string" ? errorMessage : String(errorMessage));
    }
    throw error;
  }
};

export const azureDnsDeleteTxtRecord = async (
  connection: TAzureDnsConnection,
  hostedZoneId: string,
  recordName: string,
  value: string
) => {
  const {
    credentials: { tenantId, clientId, clientSecret }
  } = connection;

  validateAzureDnsZoneResourceId(hostedZoneId);

  try {
    const accessToken = await getAzureDnsAccessToken(tenantId, clientId, clientSecret);

    await request.delete(
      `https://management.azure.com${hostedZoneId}/TXT/${encodeURIComponent(recordName)}?api-version=2018-05-01`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json"
        }
      }
    );
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 404) {
        logger.warn({ hostedZoneId, recordName, value }, "TXT record not found for deletion");
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const errorMessage = (error.response?.data?.error?.message || error.message || "Unknown error") as string;
      throw new Error(typeof errorMessage === "string" ? errorMessage : String(errorMessage));
    }
    throw error;
  }
};
