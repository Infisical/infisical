import { isAxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { logger } from "@app/lib/logger";
import {
  getEasyDNSUrl,
  listEasyDNSRecords,
  makeEasyDNSAuthHeaders
} from "@app/services/app-connection/easydns/easydns-connection-fns";
import { TEasyDNSConnection } from "@app/services/app-connection/easydns/easydns-connection-types";

export const easydnsInsertTxtRecord = async (
  connection: TEasyDNSConnection,
  hostedZoneId: string,
  domain: string,
  value: string
) => {
  const {
    credentials: { apiKey, secretKey }
  } = connection;

  logger.info({ hostedZoneId, domain, value }, "Inserting TXT record for EasyDNS");
  try {
    await request.put(
      getEasyDNSUrl(`/zones/records/add/${encodeURIComponent(hostedZoneId)}/TXT`),
      {
        host: domain,
        rdata: value
      },
      {
        headers: makeEasyDNSAuthHeaders(apiKey, secretKey),
        "Content-Type": "application/json"
      }
    );
  } catch (error) {
    if (isAxiosError(error)) {
      const data = error.response?.data;
      const errorMessage =
        (data && typeof data === "object" && "message" in data ? data.message : undefined) ||
        error.message ||
        "Unknown error";

      // EasyDNS reports duplicate records via a non-2xx response containing
      // "Record already exists" rather than a dedicated status code.
      if (typeof errorMessage === "string" && errorMessage.toLowerCase().includes("already exists")) {
        logger.info({ domain, value }, `Record already exists for domain: ${domain} and value: ${value}`);
        return;
      }

      throw new Error(typeof errorMessage === "string" ? errorMessage : String(errorMessage));
    }
    throw error;
  }
};

export const easydnsDeleteTxtRecord = async (
  connection: TEasyDNSConnection,
  hostedZoneId: string,
  domain: string,
  value: string
) => {
  const {
    credentials: { apiKey, secretKey }
  } = connection;

  logger.info({ hostedZoneId, domain, value }, "Deleting TXT record for EasyDNS");
  try {
    const dnsRecords = await listEasyDNSRecords(connection, { zoneId: hostedZoneId, host: domain });

    let foundRecord = false;
    if (dnsRecords.length > 0) {
      const recordToDelete = dnsRecords.find(
        (record) => record.type === "TXT" && record.host === domain && record.rdata === value
      );

      if (recordToDelete) {
        await request.delete(getEasyDNSUrl(`/zones/records/${encodeURIComponent(hostedZoneId)}/${recordToDelete.id}`), {
          headers: makeEasyDNSAuthHeaders(apiKey, secretKey)
        });
        foundRecord = true;
      }
    }
    if (!foundRecord) {
      logger.warn({ hostedZoneId, domain, value }, "Record to delete not found");
    }
  } catch (error) {
    if (isAxiosError(error)) {
      const data = error.response?.data;
      const errorMessage =
        (data && typeof data === "object" && "message" in data ? data.message : undefined) ||
        error.message ||
        "Unknown error";
      throw new Error(typeof errorMessage === "string" ? errorMessage : String(errorMessage));
    }
    throw error;
  }
};
