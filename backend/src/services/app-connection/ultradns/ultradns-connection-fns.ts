import { AxiosError, isAxiosError } from "axios";

import { request } from "@app/lib/config/request";
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
    return apiMessage || error.message || "Unknown error";
  }
  return error instanceof Error ? error.message : "Unknown error";
};

export const getUltraDNSAccessToken = async (environment: UltraDNSEnvironment, username: string, password: string) => {
  const { data } = await request.post<{ accessToken: string }>(
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
      const { data } = await request.get<TUltraDNSZoneListResponse>(getUltraDNSUrl(environment, "/v3/zones"), {
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

    await request.get(getUltraDNSUrl(environment, "/v3/zones"), {
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
