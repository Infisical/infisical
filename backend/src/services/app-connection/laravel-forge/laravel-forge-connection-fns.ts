/* eslint-disable no-await-in-loop */
import { AxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { BadRequestError, InternalServerError } from "@app/lib/errors";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";

import { AppConnection } from "../app-connection-enums";
import { LaravelForgeConnectionMethod } from "./laravel-forge-connection-enums";
import {
  TLaravelForgeConnection,
  TLaravelForgeConnectionConfig,
  TLaravelForgeOrganization,
  TLaravelForgeServer,
  TLaravelForgeSite,
  TRawLaravelForgeOrganization,
  TRawLaravelForgeServer,
  TRawLaravelForgeSite
} from "./laravel-forge-connection-types";

export const getLaravelForgeConnectionListItem = () => {
  return {
    name: "Laravel Forge" as const,
    app: AppConnection.LaravelForge as const,
    methods: Object.values(LaravelForgeConnectionMethod) as [LaravelForgeConnectionMethod.ApiToken]
  };
};

export const validateLaravelForgeConnectionCredentials = async (config: TLaravelForgeConnectionConfig) => {
  const { credentials: inputCredentials } = config;

  try {
    // Using the /api/me endpoint to validate the API token
    await request.get(`${IntegrationUrls.LARAVELFORGE_API_URL}/api/me`, {
      headers: {
        Authorization: `Bearer ${inputCredentials.apiToken}`,
        Accept: "application/json",
        "Content-Type": "application/json"
      }
    });
  } catch (error) {
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to validate credentials: ${error.message || "Unknown error"}`
      });
    }
    throw new BadRequestError({
      message: "Unable to validate connection: verify credentials"
    });
  }

  return inputCredentials;
};

type TLaravelForgeApiResponse<T> = {
  data: T[];
  links?: {
    next?: string;
  };
  meta?: {
    next_cursor?: string;
    prev_cursor?: string | null;
  };
};

const fetchAllPages = async <T>(
  apiToken: string,
  url: string,
  params?: Record<string, string | number>
): Promise<T[]> => {
  const allItems: T[] = [];
  let nextUrl: string | null = url;
  const queryParams = params || {};

  while (nextUrl) {
    try {
      const response: { data: TLaravelForgeApiResponse<T> } = await request.get<TLaravelForgeApiResponse<T>>(nextUrl, {
        params: queryParams,
        headers: {
          Authorization: `Bearer ${apiToken}`,
          Accept: "application/json",
          "Content-Type": "application/json"
        }
      });

      if (!response?.data?.data) {
        throw new InternalServerError({
          message: `Failed to fetch data from ${url}: Response was empty or malformed`
        });
      }

      allItems.push(...response.data.data);

      if (response.data.links?.next) {
        nextUrl = response.data.links.next;
      } else {
        nextUrl = null;
      }
    } catch (error) {
      if (error instanceof AxiosError) {
        throw new BadRequestError({
          message: `Failed to fetch data from ${url}: ${error.message || "Unknown error"}`
        });
      }
      throw error;
    }
  }

  return allItems;
};

export const listLaravelForgeOrganizations = async (
  appConnection: TLaravelForgeConnection
): Promise<TLaravelForgeOrganization[]> => {
  const { credentials } = appConnection;
  const { apiToken } = credentials;

  const rawOrganizations = await fetchAllPages<TRawLaravelForgeOrganization>(
    apiToken,
    `${IntegrationUrls.LARAVELFORGE_API_URL}/api/orgs`
  );

  return rawOrganizations.map((org: TRawLaravelForgeOrganization) => ({
    id: org.id,
    name: org.attributes.name,
    slug: org.attributes.slug
  }));
};

export const listLaravelForgeServers = async (
  appConnection: TLaravelForgeConnection,
  organizationSlug: string
): Promise<TLaravelForgeServer[]> => {
  const { credentials } = appConnection;
  const { apiToken } = credentials;

  const rawServers = await fetchAllPages<TRawLaravelForgeServer>(
    apiToken,
    `${IntegrationUrls.LARAVELFORGE_API_URL}/api/orgs/${organizationSlug}/servers`
  );

  return rawServers.map((server: TRawLaravelForgeServer) => ({
    id: server.id,
    name: server.attributes.name
  }));
};

export const listLaravelForgeSites = async (
  appConnection: TLaravelForgeConnection,
  organizationSlug: string,
  serverId: number
): Promise<TLaravelForgeSite[]> => {
  const { credentials } = appConnection;
  const { apiToken } = credentials;

  const rawSites = await fetchAllPages<TRawLaravelForgeSite>(
    apiToken,
    `${IntegrationUrls.LARAVELFORGE_API_URL}/api/orgs/${organizationSlug}/servers/${serverId}/sites`
  );

  return rawSites.map((site: TRawLaravelForgeSite) => ({
    id: site.id,
    name: site.attributes.name
  }));
};
