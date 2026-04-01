import axios from "axios";

import { request } from "@app/lib/config/request";
import { logger } from "@app/lib/logger";
import { TPowerDNSConnection } from "@app/services/app-connection/powerdns/powerdns-connection-types";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";

const normalizePowerDNSZone = (zone: string): string => {
  return zone.endsWith(".") ? zone : `${zone}.`;
};

const normalizePowerDNSRecordName = (name: string): string => {
  return name.endsWith(".") ? name : `${name}.`;
};

export const powerDnsInsertTxtRecord = async (
  connection: TPowerDNSConnection,
  hostedZoneId: string,
  domain: string,
  value: string
) => {
  const {
    credentials: { apiKey, baseUrl }
  } = connection;

  await blockLocalAndPrivateIpAddresses(baseUrl);

  const zone = normalizePowerDNSZone(hostedZoneId);
  // domain is the full FQDN (e.g. "_acme-challenge.example.com"), ensure trailing dot for PowerDNS
  const recordName = normalizePowerDNSRecordName(domain);

  logger.info({ zone, recordName, value }, "Inserting TXT record for PowerDNS");

  try {
    await request.patch(
      `${baseUrl}/servers/localhost/zones/${encodeURIComponent(zone)}`,
      {
        rrsets: [
          {
            name: recordName,
            type: "TXT",
            ttl: 60,
            changetype: "REPLACE",
            records: [
              {
                content: value,
                disabled: false
              }
            ]
          }
        ]
      },
      {
        headers: {
          "x-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "application/json"
        }
      }
    );
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const errorMessage =
        (error.response?.data as { error?: string })?.error || error.message || "Unknown error";
      throw new Error(typeof errorMessage === "string" ? errorMessage : String(errorMessage));
    }
    throw error;
  }
};

export const powerDnsDeleteTxtRecord = async (
  connection: TPowerDNSConnection,
  hostedZoneId: string,
  domain: string,
) => {
  const {
    credentials: { apiKey, baseUrl }
  } = connection;

  await blockLocalAndPrivateIpAddresses(baseUrl);

  const zone = normalizePowerDNSZone(hostedZoneId);
  const recordName = normalizePowerDNSRecordName(domain);

  logger.info({ zone, recordName, value }, "Deleting TXT record for PowerDNS");

  try {
    // PowerDNS returns 204 even if the record does not exist, so no pre-check needed
    await request.patch(
      `${baseUrl}/servers/localhost/zones/${encodeURIComponent(zone)}`,
      {
        rrsets: [
          {
            name: recordName,
            type: "TXT",
            changetype: "DELETE"
          }
        ]
      },
      {
        headers: {
          "x-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "application/json"
        }
      }
    );
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const errorMessage =
        (error.response?.data as { error?: string })?.error || error.message || "Unknown error";
      throw new Error(typeof errorMessage === "string" ? errorMessage : String(errorMessage));
    }
    throw error;
  }
};
