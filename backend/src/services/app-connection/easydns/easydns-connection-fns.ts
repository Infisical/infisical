import { AxiosError } from "axios";

import { getConfig } from "@app/lib/config/env";
import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";

import { EasyDNSConnectionMethod } from "./easydns-connection-enum";
import { TEasyDNSConnection, TEasyDNSConnectionConfig } from "./easydns-connection-types";

interface EasyDNSRecord {
  id: string;
  domain: string;
  host: string;
  ttl: string | null;
  prio: string | null;
  type: string;
  rdata: string;
}

interface EasyDNSSearchResponse {
  tm: number;
  count: number;
  data: EasyDNSRecord[];
}

export const getEasyDNSUrl = (path: string) => {
  const appCfg = getConfig();
  return `${appCfg.EASYDNS_SANDBOX_ENABLED ? IntegrationUrls.EASYDNS_SANDBOX_API_URL : IntegrationUrls.EASYDNS_API_URL}${path}`;
};

export const makeEasyDNSAuthHeaders = (apiKey: string, secretKey: string): Record<string, string> => {
  const credentials = Buffer.from(`${apiKey}:${secretKey}`).toString("base64");
  return {
    Authorization: `Basic ${credentials}`,
    Accept: "application/json"
  };
};

export const getEasyDNSConnectionListItem = () => {
  return {
    name: "EasyDNS" as const,
    app: AppConnection.EasyDNS as const,
    methods: Object.values(EasyDNSConnectionMethod) as [EasyDNSConnectionMethod.APIKeySecret]
  };
};

export const listEasyDNSRecords = async (
  appConnection: TEasyDNSConnection,
  options: { zoneId: string; host: string }
): Promise<EasyDNSRecord[]> => {
  if (appConnection.method !== EasyDNSConnectionMethod.APIKeySecret) {
    throw new BadRequestError({ message: "Unsupported EasyDNS connection method" });
  }

  const {
    credentials: { apiKey, secretKey }
  } = appConnection;

  try {
    // The EasyDNS search endpoint performs a substring match across the zone's
    // records, so results are filtered by exact host on the client side.
    const resp = await request.get<EasyDNSSearchResponse>(
      getEasyDNSUrl(`/zones/records/all/${encodeURIComponent(options.zoneId)}/search/${encodeURIComponent(options.host)}`),
      {
        headers: makeEasyDNSAuthHeaders(apiKey, secretKey)
      }
    );

    return (resp.data?.data ?? []).filter((record) => record.host === options.host);
  } catch (error: unknown) {
    logger.error(error, "Error listing EasyDNS records");
    if (error instanceof AxiosError) {
      const data = error.response?.data;
      const message =
        (data && typeof data === "object" && "message" in data ? data.message : undefined) ||
        error.message ||
        "Unknown error";
      throw new BadRequestError({
        message: `Failed to list EasyDNS records: ${typeof message === "string" ? message : String(message)}`
      });
    }
    throw new BadRequestError({
      message: "Unable to list EasyDNS records"
    });
  }
};

export const validateEasyDNSConnectionCredentials = async (config: TEasyDNSConnectionConfig) => {
  if (config.method !== EasyDNSConnectionMethod.APIKeySecret) {
    throw new BadRequestError({ message: "Unsupported EasyDNS connection method" });
  }

  const {
    credentials: { apiKey, secretKey }
  } = config;

  try {
    // The EasyDNS API has no dedicated zone-listing endpoint, so a search against
    // the apex host is used as the credential probe. Invalid credentials yield a
    // non-2xx response which surfaces below.
    await request.get<EasyDNSSearchResponse>(getEasyDNSUrl(`/zones/records/all/@/search/@`), {
      headers: makeEasyDNSAuthHeaders(apiKey, secretKey)
    });
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      const data = error.response?.data;
      const message =
        (data && typeof data === "object" && "message" in data ? data.message : undefined) ||
        error.message ||
        "Unknown error";
      throw new BadRequestError({
        message: `Failed to validate EasyDNS credentials: ${typeof message === "string" ? message : String(message)}`
      });
    }
    throw new BadRequestError({
      message: "Unable to validate EasyDNS credentials"
    });
  }
};
