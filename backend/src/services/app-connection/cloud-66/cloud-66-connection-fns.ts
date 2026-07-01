import { AxiosError, AxiosResponse } from "axios";

import { request } from "@app/lib/config/request";
import { UnauthorizedError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { Cloud66ConnectionMethod } from "./cloud-66-connection-enums";
import { TCloud66Connection, TCloud66ConnectionConfig, TCloud66Stack } from "./cloud-66-connection-types";

export const CLOUD_66_API_BASE_URL = "https://app.cloud66.com/api";

const PER_PAGE_ITEMS = 30;
const MAX_CLOUD_66_RETRIES = 5;
const CLOUD_66_RATE_LIMIT_DELAY_MS = 60_000;

export const getCloud66Headers = (accessToken: string) => ({
  Authorization: `Bearer ${accessToken}`,
  Accept: "application/json"
});

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

// Cloud 66 rate-limits requests (HTTP 429); retry after a delay before giving up.
const cloud66GetWithRetry = async (url: string, accessToken: string, attempt = 0): Promise<AxiosResponse> => {
  try {
    return await request.get(url, { headers: getCloud66Headers(accessToken) });
  } catch (error) {
    if (error instanceof AxiosError && error.response?.status === 429 && attempt < MAX_CLOUD_66_RETRIES) {
      await sleep(CLOUD_66_RATE_LIMIT_DELAY_MS);
      return cloud66GetWithRetry(url, accessToken, attempt + 1);
    }

    throw error;
  }
};

// Walks Cloud 66's `page`/`pagination.next` cursor, retrying rate-limited pages, and returns every item.
export const paginateCloud66 = async <T>(accessToken: string, path: string): Promise<T[]> => {
  const items: T[] = [];
  let page: number | null = 1;

  while (page) {
    const currentPage = page;

    // eslint-disable-next-line no-await-in-loop
    const res = await cloud66GetWithRetry(
      `${CLOUD_66_API_BASE_URL}${path}?page=${currentPage}&per_page=${PER_PAGE_ITEMS}`,
      accessToken
    );

    const { response, pagination } = res.data as {
      response: T[];
      pagination?: { next: number | null };
    };

    items.push(...response);

    page = pagination?.next ?? null;
  }

  return items;
};

export const getCloud66ConnectionListItem = () => {
  return {
    name: "Cloud 66" as const,
    app: AppConnection.Cloud66 as const,
    methods: Object.values(Cloud66ConnectionMethod) as [Cloud66ConnectionMethod.AccessToken]
  };
};

export const validateCloud66ConnectionCredentials = async (config: TCloud66ConnectionConfig) => {
  const { accessToken } = config.credentials;

  try {
    await request.get(`${CLOUD_66_API_BASE_URL}/3/stacks`, {
      headers: getCloud66Headers(accessToken),
      validateStatus: (status) => status === 200
    });
  } catch (error: unknown) {
    logger.error({ error }, "failed to validate cloud 66 connection");

    throw new UnauthorizedError({
      message: "Unable to validate connection: invalid Personal Access Token"
    });
  }

  return config.credentials;
};

export const listCloud66Stacks = async (appConnection: TCloud66Connection): Promise<TCloud66Stack[]> => {
  const { accessToken } = appConnection.credentials;

  const stacks = await paginateCloud66<{ uid: string; name: string }>(accessToken, "/3/stacks");

  return stacks.map((stack) => ({ id: stack.uid, name: stack.name }));
};
