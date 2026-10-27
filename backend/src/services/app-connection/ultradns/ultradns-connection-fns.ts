import { AxiosError, AxiosInstance, isAxiosError } from "axios";

import { createRequestClient } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";

import { UltraDNSConnectionMethod, UltraDNSEnvironment } from "./ultradns-connection-enum";
import { TUltraDNSConnectionConfig, TUltraDNSZone } from "./ultradns-connection-types";

type TUltraDNSZoneListResponse = {
  zones?: { properties: { name: string; type: string } }[];
  cursorInfo?: { next?: string };
};

const ZONE_PAGE_SIZE = 1000;
const MAX_ZONE_PAGES = 100;

export const ULTRADNS_REQUEST_TIMEOUT_MS = 10_000;

const TWO_FACTOR_ERROR_FRAGMENT = "two factor mobile authentication";

export const ultraDNSRequest = createRequestClient({ timeout: ULTRADNS_REQUEST_TIMEOUT_MS });

export const ultraDNSSingleAttemptRequest = createRequestClient(
  { timeout: ULTRADNS_REQUEST_TIMEOUT_MS },
  { retries: 0 }
);

export const getUltraDNSUrl = (environment: UltraDNSEnvironment, path: string) => {
  const baseUrl =
    environment === UltraDNSEnvironment.Test ? IntegrationUrls.ULTRADNS_TEST_API_URL : IntegrationUrls.ULTRADNS_API_URL;
  return `${baseUrl}${path}`;
};

export const getUltraDNSErrorMessage = (error: unknown) => {
  if (isAxiosError(error)) {
    const data = error.response?.data as
      | { errorMessage?: string; error_description?: string }
      | { errorMessage?: string }[]
      | undefined;
    const apiMessage = Array.isArray(data) ? data[0]?.errorMessage : (data?.errorMessage ?? data?.error_description);
    if (apiMessage?.toLowerCase().includes(TWO_FACTOR_ERROR_FRAGMENT)) {
      return "This UltraDNS user has Two Factor Mobile Authentication enabled, and UltraDNS blocks API access for those users. Turn it off for this user in the UltraDNS Portal, or connect with a different user.";
    }
    return apiMessage || error.message || "Unknown error";
  }
  return error instanceof Error ? error.message : "Unknown error";
};

export const getUltraDNSAccessToken = async (
  environment: UltraDNSEnvironment,
  username: string,
  password: string,
  client: AxiosInstance = ultraDNSRequest
) => {
  const { data } = await client.post<{ accessToken: string }>(
    getUltraDNSUrl(environment, "/v1/authorization/token"),
    new URLSearchParams({ grant_type: "password", username, password }).toString(),
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json"
      }
    }
  );

  return data.accessToken;
};

export const getUltraDNSConnectionListItem = () => {
  return {
    name: "UltraDNS" as const,
    app: AppConnection.UltraDNS as const,
    methods: Object.values(UltraDNSConnectionMethod) as [UltraDNSConnectionMethod.UsernamePassword]
  };
};

export const listUltraDNSZones = async (config: TUltraDNSConnectionConfig): Promise<TUltraDNSZone[]> => {
  if (config.method !== UltraDNSConnectionMethod.UsernamePassword) {
    throw new BadRequestError({ message: "Unsupported UltraDNS connection method" });
  }

  const {
    credentials: { username, password, environment }
  } = config;

  try {
    const accessToken = await getUltraDNSAccessToken(environment, username, password);

    const zones: TUltraDNSZone[] = [];
    let cursor: string | undefined;

    for (let page = 0; page < MAX_ZONE_PAGES; page += 1) {
      // eslint-disable-next-line no-await-in-loop
      const { data } = await ultraDNSRequest.get<TUltraDNSZoneListResponse>(getUltraDNSUrl(environment, "/v3/zones"), {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json"
        },
        params: {
          q: "zone_type:PRIMARY",
          limit: ZONE_PAGE_SIZE,
          ...(cursor ? { cursor } : {})
        }
      });

      zones.push(...(data.zones ?? []).map((zone) => ({ id: zone.properties.name, name: zone.properties.name })));

      cursor = data.cursorInfo?.next;
      if (!cursor) return zones;
    }

    logger.warn({ zoneCount: zones.length }, "Stopped listing UltraDNS zones after reaching the page limit");
    return zones;
  } catch (error) {
    logger.error(error, "Error listing UltraDNS zones");
    throw new BadRequestError({ message: `Failed to list UltraDNS zones: ${getUltraDNSErrorMessage(error)}` });
  }
};

export const validateUltraDNSConnectionCredentials = async (config: TUltraDNSConnectionConfig) => {
  if (config.method !== UltraDNSConnectionMethod.UsernamePassword) {
    throw new BadRequestError({ message: "Unsupported UltraDNS connection method" });
  }

  const { username, password, environment } = config.credentials;

  try {
    const accessToken = await getUltraDNSAccessToken(environment, username, password);

    await ultraDNSRequest.get(getUltraDNSUrl(environment, "/v3/zones"), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json"
      },
      params: { limit: 1 }
    });
  } catch (error) {
    if (error instanceof AxiosError) {
      throw new BadRequestError({ message: `Failed to validate credentials: ${getUltraDNSErrorMessage(error)}` });
    }
    logger.error(error, "Error validating UltraDNS connection credentials");
    throw new BadRequestError({ message: "Unable to validate connection: verify credentials" });
  }

  return config.credentials;
};
