import { AxiosError } from "axios";

import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { safeRequest } from "@app/lib/validator";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";

import { CloudflareConnectionMethod, CloudflareR2Jurisdiction } from "./cloudflare-connection-enum";
import {
  TCloudflareConnection,
  TCloudflareConnectionConfig,
  TCloudflarePagesProject,
  TCloudflarePermissionGroup,
  TCloudflareR2Bucket,
  TCloudflareR2BucketsApiResponse,
  TCloudflareWorkersScript,
  TCloudflareZone
} from "./cloudflare-connection-types";

// Cloudflare caps per_page at 50 on the list endpoints we use
const CLOUDFLARE_PER_PAGE = 50;
const CLOUDFLARE_MAX_PAGES = 100;

// R2's maximum. Cursor pagination is strictly sequential, so a large page keeps round-trips down.
const CLOUDFLARE_R2_BUCKETS_PER_PAGE = 1000;

export const getCloudflareAuthHeaders = (apiToken: string) => ({
  Authorization: `Bearer ${apiToken}`,
  Accept: "application/json"
});

export const getCloudflareErrorMessage = (error: unknown) => {
  if (error instanceof AxiosError) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    return (error.response?.data?.errors?.[0]?.message as string) || error.message || "Unknown error";
  }

  // every Cloudflare failure is reported through here, so a non-HTTP error (a safeRequest rejection, a
  // programming error) must still say something diagnosable rather than collapsing to "Unknown error"
  if (error instanceof Error) return error.message || "Unknown error";

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
    const { data } = await safeRequest.get<{ result: T[]; result_info?: { total_pages?: number } }>(url, {
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

  const { data } = await safeRequest.get<{ result: { name: string; id: string }[] }>(
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

  const { data } = await safeRequest.get<{ result: { id: string }[] }>(
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

/** This endpoint returns the account's full set of token permission groups in one response. */
export const listCloudflarePermissionGroups = async (
  appConnection: TCloudflareConnection
): Promise<TCloudflarePermissionGroup[]> => {
  const {
    credentials: { apiToken, accountId }
  } = appConnection;

  const { data } = await safeRequest.get<{
    result: { id: string; name: string; scopes?: string[] }[];
  }>(`${IntegrationUrls.CLOUDFLARE_API_URL}/client/v4/accounts/${accountId}/tokens/permission_groups`, {
    headers: getCloudflareAuthHeaders(apiToken)
  });

  return data.result.map((a) => ({
    id: a.id,
    name: a.name,
    scopes: a.scopes ?? []
  }));
};

/**
 * Unlike the other list endpoints, `r2/buckets` returns its array under `result.buckets` and paginates
 * with an opaque cursor from `result_info.cursor` rather than reporting `result_info.total_pages`, so
 * it can't go through `$paginateCloudflare`.
 */
const $listCloudflareR2BucketsForJurisdiction = async ({
  accountId,
  apiToken,
  jurisdiction
}: {
  accountId: string;
  apiToken: string;
  jurisdiction: CloudflareR2Jurisdiction;
}): Promise<TCloudflareR2Bucket[]> => {
  const buckets: TCloudflareR2Bucket[] = [];

  let cursor: string | undefined;

  for (let page = 0; page < CLOUDFLARE_MAX_PAGES; page += 1) {
    // eslint-disable-next-line no-await-in-loop
    const { data } = await safeRequest.get<TCloudflareR2BucketsApiResponse>(
      `${IntegrationUrls.CLOUDFLARE_API_URL}/client/v4/accounts/${accountId}/r2/buckets`,
      {
        headers: { ...getCloudflareAuthHeaders(apiToken), "cf-r2-jurisdiction": jurisdiction },
        params: { per_page: CLOUDFLARE_R2_BUCKETS_PER_PAGE, ...(cursor ? { cursor } : {}) }
      }
    );

    buckets.push(
      ...(data.result?.buckets ?? []).map((bucket) => ({
        name: bucket.name,
        // the payload omits the jurisdiction for `default`, so fall back to the one we asked for
        jurisdiction: (bucket.jurisdiction as CloudflareR2Jurisdiction) || jurisdiction
      }))
    );

    cursor = data.result_info?.cursor;
    if (!cursor) break;
  }

  return buckets;
};

export const listCloudflareR2Buckets = async (appConnection: TCloudflareConnection): Promise<TCloudflareR2Bucket[]> => {
  const {
    credentials: { apiToken, accountId }
  } = appConnection;

  const jurisdictions = Object.values(CloudflareR2Jurisdiction);

  // A bucket's jurisdiction is only reachable by asking for it, and accounts without EU/FedRAMP
  // enabled reject those requests — a failure in one jurisdiction must not hide the others' buckets.
  const results = await Promise.allSettled(
    jurisdictions.map((jurisdiction) => $listCloudflareR2BucketsForJurisdiction({ accountId, apiToken, jurisdiction }))
  );

  return results.flatMap((result, index) => {
    if (result.status === "fulfilled") return result.value;

    // an account without EU/FedRAMP enabled rejects those jurisdictions, so this is the expected path
    // for most accounts on every call — not an error worth paging on
    logger.debug(
      result.reason,
      `listCloudflareR2Buckets: skipping unavailable jurisdiction [jurisdiction=${jurisdictions[index]}]`
    );

    return [];
  });
};

export const validateCloudflareConnectionCredentials = async (config: TCloudflareConnectionConfig) => {
  const { apiToken } = config.credentials;

  try {
    const resp = await safeRequest.get(`${IntegrationUrls.CLOUDFLARE_API_URL}/client/v4/user/tokens/verify`, {
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
