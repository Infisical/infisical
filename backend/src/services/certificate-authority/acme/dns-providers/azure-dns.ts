import { isAxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { logger } from "@app/lib/logger";
import {
  getAzureDnsConnectionAccessToken,
  validateAzureDnsZoneResourceId
} from "@app/services/app-connection/azure-dns/azure-dns-connection-fns";
import { TAzureDnsConnection } from "@app/services/app-connection/azure-dns/azure-dns-connection-types";
import { TOidcIssuerServiceFactory } from "@app/services/oidc-issuer/oidc-issuer-service";

export const azureDnsInsertTxtRecord = async (
  connection: TAzureDnsConnection,
  hostedZoneId: string,
  recordName: string,
  value: string,
  oidcIssuerService: Pick<TOidcIssuerServiceFactory, "signToken">
) => {
  validateAzureDnsZoneResourceId(hostedZoneId);

  try {
    const accessToken = await getAzureDnsConnectionAccessToken(connection, oidcIssuerService);

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
    if (isAxiosError(error)) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const errorMessage = (error.response?.data?.error?.message || error.message || "Unknown error") as string;
      throw new Error(typeof errorMessage === "string" ? errorMessage : String(errorMessage));
    }
    throw error;
  }
};

type TAzureTxtRecordSet = {
  etag?: string;
  properties?: { TTL?: number; metadata?: Record<string, string>; TXTRecords?: { value: string[] }[] };
};

export const azureDnsAppendTxtRecord = async (
  connection: TAzureDnsConnection,
  hostedZoneId: string,
  recordName: string,
  value: string,
  oidcIssuerService: Pick<TOidcIssuerServiceFactory, "signToken">,
  abortSignal?: AbortSignal
) => {
  validateAzureDnsZoneResourceId(hostedZoneId);
  const unquotedValue = value.replaceAll('"', "");
  const recordUrl = `https://management.azure.com${hostedZoneId}/TXT/${encodeURIComponent(recordName)}?api-version=2018-05-01`;

  try {
    const accessToken = await getAzureDnsConnectionAccessToken(connection, oidcIssuerService);
    const headers = { Authorization: `Bearer ${accessToken}`, Accept: "application/json" };

    let existing: TAzureTxtRecordSet | undefined;
    try {
      existing = (await request.get<TAzureTxtRecordSet>(recordUrl, { headers, signal: abortSignal })).data;
    } catch (error) {
      if (!isAxiosError(error) || error.response?.status !== 404) throw error;
    }

    const existingRecords = existing?.properties?.TXTRecords ?? [];
    if (existingRecords.some((record) => record.value.join("") === unquotedValue)) return;

    await request.put(
      recordUrl,
      {
        properties: {
          ...(existing?.properties?.metadata ? { metadata: existing.properties.metadata } : {}),
          TTL: existing?.properties?.TTL ?? 60,
          TXTRecords: [...existingRecords, { value: [unquotedValue] }]
        }
      },
      {
        headers: {
          ...headers,
          "Content-Type": "application/json",
          ...(existing?.etag ? { "If-Match": existing.etag } : {}),
          ...(existing ? {} : { "If-None-Match": "*" })
        },
        signal: abortSignal
      }
    );
  } catch (error) {
    if (isAxiosError(error)) {
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
  value: string,
  oidcIssuerService: Pick<TOidcIssuerServiceFactory, "signToken">
) => {
  validateAzureDnsZoneResourceId(hostedZoneId);

  try {
    const accessToken = await getAzureDnsConnectionAccessToken(connection, oidcIssuerService);

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
    if (isAxiosError(error)) {
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
