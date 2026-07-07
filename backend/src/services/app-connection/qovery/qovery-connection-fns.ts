import { AxiosError, AxiosResponse, HttpStatusCode } from "axios";

import { request } from "@app/lib/config/request";
import { applyJitter, delay } from "@app/lib/delay";
import { BadRequestError } from "@app/lib/errors";

import { AppConnection } from "../app-connection-enums";
import { QoveryConnectionMethod } from "./qovery-connection-enums";
import { TQoveryConnection, TQoveryConnectionConfig, TQoveryPaginatedResponse } from "./qovery-connection-types";

const QOVERY_PAGE_SIZE = 100;
const QOVERY_MAX_RETRIES = 5;
const QOVERY_RETRY_DELAY_MS = 2_000;
const QOVERY_MAX_PAGES = 1_000;

// Qovery is a hosted-only service; self-hosting its API is not possible, so the API URL is fixed.
export const QOVERY_DEFAULT_API_URL = "https://api.qovery.com";

export const getQoveryAuthHeaders = (accessToken: string) => ({
  Authorization: `Token ${accessToken}`,
  Accept: "application/json"
});

const sleep = () => delay(applyJitter(QOVERY_RETRY_DELAY_MS));

const requestQoveryWithRetry = async <T>(
  url: string,
  accessToken: string,
  params: Record<string, number>,
  attempt = 0
): Promise<AxiosResponse<T>> => {
  try {
    return await request.get<T>(url, {
      params,
      headers: getQoveryAuthHeaders(accessToken)
    });
  } catch (error) {
    if (
      error instanceof AxiosError &&
      error.response?.status === HttpStatusCode.TooManyRequests &&
      attempt < QOVERY_MAX_RETRIES
    ) {
      await sleep();

      return requestQoveryWithRetry<T>(url, accessToken, params, attempt + 1);
    }

    throw error;
  }
};

// Walks every page of a Qovery list endpoint via ?page=N&page_size=..., accumulating `results`.
// Qovery returns { results, pagination: { total_pages, ... } }; absence of a pagination block is
// treated as a single page.
export const paginatedQoveryRequest = async <T>(
  url: string,
  accessToken: string,
  pageSize = QOVERY_PAGE_SIZE
): Promise<T[]> => {
  const results: T[] = [];
  // totalPages starts at 1 so the first page is always fetched; the real total replaces it after that.
  let totalPages = 1;
  let page = 1;

  while (page <= totalPages && page <= QOVERY_MAX_PAGES) {
    // eslint-disable-next-line no-await-in-loop
    const { data } = await requestQoveryWithRetry<TQoveryPaginatedResponse<T>>(url, accessToken, {
      page,
      page_size: pageSize
    });

    results.push(...(data.results ?? []));
    totalPages = data.pagination?.total_pages ?? page;
    page += 1;
  }

  return results;
};

export type TQoveryResource = { id: string; name: string };

const listQoveryResources = async (appConnection: TQoveryConnection, path: string): Promise<TQoveryResource[]> => {
  const { accessToken } = appConnection.credentials;

  const results = await paginatedQoveryRequest<TQoveryResource>(`${QOVERY_DEFAULT_API_URL}${path}`, accessToken);

  return results.map(({ id, name }) => ({ id, name }));
};

export const listQoveryOrganizations = async (appConnection: TQoveryConnection) =>
  listQoveryResources(appConnection, "/organization");

export const listQoveryProjects = async (appConnection: TQoveryConnection, organizationId: string) =>
  listQoveryResources(appConnection, `/organization/${organizationId}/project`);

export const listQoveryEnvironments = async (appConnection: TQoveryConnection, projectId: string) =>
  listQoveryResources(appConnection, `/project/${projectId}/environment`);

export const getQoveryConnectionListItem = () => {
  return {
    name: "Qovery" as const,
    app: AppConnection.Qovery as const,
    methods: Object.values(QoveryConnectionMethod) as [QoveryConnectionMethod.AccessToken]
  };
};

export const validateQoveryConnectionCredentials = async (config: TQoveryConnectionConfig) => {
  const { accessToken } = config.credentials;

  try {
    await request.get(`${QOVERY_DEFAULT_API_URL}/organization`, {
      headers: {
        Authorization: `Token ${accessToken}`,
        Accept: "application/json"
      }
    });
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to validate Qovery credentials: ${error.message || "Unknown error"}`
      });
    }

    throw new BadRequestError({
      message: "Failed to validate Qovery credentials - verify the project access token is correct"
    });
  }

  return config.credentials;
};
