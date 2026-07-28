import { AxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";

import { CloudflareConnectionMethod } from "./cloudflare-connection-enum";
import {
  TCloudflareConnection,
  TCloudflareConnectionConfig,
  TCloudflarePagesProject,
  TCloudflarePermissionGroup,
  TCloudflareWorkersScript,
  TCloudflareZone
} from "./cloudflare-connection-types";

// Cloudflare caps per_page at 50 on the list endpoints we use
const CLOUDFLARE_PER_PAGE = 50;
const CLOUDFLARE_MAX_PAGES = 100;

export const getCloudflareAuthHeaders = (apiToken: string) => ({
  Authorization: `Bearer ${apiToken}`,
  Accept: "application/json"
});

export const getCloudflareErrorMessage = (error: unknown) => {
  if (error instanceof AxiosError) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    return (error.response?.data?.errors?.[0]?.message as string) || error.message || "Unknown error";
  }

  return "Unknown error";
};

/** Walks a paginated Cloudflare list endpoint using the `result_info.total_pages` it reports. */
const $paginateCloudflare = async <T>(
  url: string,
  { apiToken, params }: { apiToken: string; params?: Record<string, unknown> }
): Promise<T[]> => {
  const results: T[] = [];

  let page = 1;
  let totalPages = 1;

  while (page <= totalPages && page <= CLOUDFLARE_MAX_PAGES) {
    // eslint-disable-next-line no-await-in-loop
    const { data } = await request.get<{ result: T[]; result_info?: { total_pages?: number } }>(url, {
      headers: getCloudflareAuthHeaders(apiToken),
      params: { ...params, page, per_page: CLOUDFLARE_PER_PAGE }
    });

    results.push(...data.result);

    totalPages = data.result_info?.total_pages ?? 1;
    page += 1;
  }

  return results;
};

export const getCloudflareConnectionListItem = () => {
  return {
    name: "Cloudflare" as const,
    app: AppConnection.Cloudflare as const,
    methods: Object.values(CloudflareConnectionMethod) as [CloudflareConnectionMethod.APIToken]
  };
};

export const listCloudflarePagesProjects = async (
  appConnection: TCloudflareConnection
): Promise<TCloudflarePagesProject[]> => {
  const {
    credentials: { apiToken, accountId }
  } = appConnection;

  const { data } = await request.get<{ result: { name: string; id: string }[] }>(
    `${IntegrationUrls.CLOUDFLARE_API_URL}/client/v4/accounts/${accountId}/pages/projects`,
    { headers: getCloudflareAuthHeaders(apiToken) }
  );

  return data.result.map((a) => ({
    name: a.name,
    id: a.id
  }));
};

export const listCloudflareWorkersScripts = async (
  appConnection: TCloudflareConnection
): Promise<TCloudflareWorkersScript[]> => {
  const {
    credentials: { apiToken, accountId }
  } = appConnection;

  const { data } = await request.get<{ result: { id: string }[] }>(
    `${IntegrationUrls.CLOUDFLARE_API_URL}/client/v4/accounts/${accountId}/workers/scripts`,
    { headers: getCloudflareAuthHeaders(apiToken) }
  );

  return data.result.map((a) => ({
    id: a.id
  }));
};

export const listCloudflareZones = async (appConnection: TCloudflareConnection): Promise<TCloudflareZone[]> => {
  const {
    credentials: { apiToken }
  } = appConnection;

  const zones = await $paginateCloudflare<{ id: string; name: string }>(
    `${IntegrationUrls.CLOUDFLARE_API_URL}/client/v4/zones`,
    { apiToken }
  );

  return zones.map((a) => ({
    name: a.name,
    id: a.id
  }));
};

/**
 * Unlike the other list endpoints, token permission groups don't reliably report
 * `result_info.total_pages`, so this paginates on its own: keep requesting while a page comes back
 * full and stop on the first partial page.
 */
export const listCloudflarePermissionGroups = async (
  appConnection: TCloudflareConnection
): Promise<TCloudflarePermissionGroup[]> => {
  const {
    credentials: { apiToken, accountId }
  } = appConnection;

  const permissionGroups: TCloudflarePermissionGroup[] = [];

  for (let page = 1; page <= CLOUDFLARE_MAX_PAGES; page += 1) {
    // eslint-disable-next-line no-await-in-loop
    const { data } = await request.get<{ result: { id: string; name: string; scopes?: string[] }[] }>(
      `${IntegrationUrls.CLOUDFLARE_API_URL}/client/v4/accounts/${accountId}/tokens/permission_groups`,
      {
        headers: getCloudflareAuthHeaders(apiToken),
        params: { page, per_page: CLOUDFLARE_PER_PAGE }
      }
    );

    permissionGroups.push(
      ...data.result.map((a) => ({
        id: a.id,
        name: a.name,
        scopes: a.scopes ?? []
      }))
    );

    if (data.result.length < CLOUDFLARE_PER_PAGE) break;
  }

  return permissionGroups;
};

export const validateCloudflareConnectionCredentials = async (config: TCloudflareConnectionConfig) => {
  const { apiToken, accountId } = config.credentials;

  try {
    const resp = await request.get(`${IntegrationUrls.CLOUDFLARE_API_URL}/client/v4/accounts/${accountId}`, {
      headers: getCloudflareAuthHeaders(apiToken)
    });

    if (resp.data === null) {
      throw new BadRequestError({
        message: "Unable to validate connection: Invalid API token provided."
      });
    }
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to validate credentials: ${getCloudflareErrorMessage(error)}`
      });
    }
    throw new BadRequestError({
      message: "Unable to validate connection: verify credentials"
    });
  }

  return config.credentials;
};
