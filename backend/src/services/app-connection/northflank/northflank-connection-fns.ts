import { AxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { logger, sanitizeUrlForLog } from "@app/lib/logger";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { NorthflankConnectionMethod } from "./northflank-connection-enums";
import {
  TNorthflankConnection,
  TNorthflankConnectionConfig,
  TNorthflankProject,
  TNorthflankSecretGroup
} from "./northflank-connection-types";

const NORTHFLANK_API_URL = "https://api.northflank.com";

// Northflank returns 50 entries per page by default and caps per_page at 100.
const NORTHFLANK_PER_PAGE = 100;
const NORTHFLANK_MAX_PAGES = 100;

/**
 * Walks a paginated Northflank list endpoint using the opaque `pagination.cursor` it returns,
 * stopping on `hasNextPage`. `key` selects the array Northflank nests under `data`.
 */
const $paginateNorthflank = async <T>({
  url,
  apiToken,
  key
}: {
  url: string;
  apiToken: string;
  key: string;
}): Promise<T[]> => {
  const results: T[] = [];

  let cursor: string | undefined;
  let hasNextPage = false;

  for (let page = 0; page < NORTHFLANK_MAX_PAGES; page += 1) {
    // eslint-disable-next-line no-await-in-loop
    const { data } = await request.get<{
      data: Record<string, T[]>;
      pagination?: { hasNextPage?: boolean; cursor?: string };
    }>(url, {
      headers: {
        Authorization: `Bearer ${apiToken}`,
        Accept: "application/json"
      },
      params: { per_page: NORTHFLANK_PER_PAGE, ...(cursor ? { cursor } : {}) }
    });

    results.push(...(data.data?.[key] ?? []));

    cursor = data.pagination?.cursor;
    hasNextPage = Boolean(data.pagination?.hasNextPage && cursor);
    if (!hasNextPage) break;
  }

  if (hasNextPage) {
    logger.warn(
      `$paginateNorthflank: page cap reached, returning a partial list [url=${sanitizeUrlForLog(url)}] [pagesRead=${NORTHFLANK_MAX_PAGES}]`
    );
  }

  return results;
};

export const getNorthflankConnectionListItem = () => {
  return {
    name: "Northflank" as const,
    app: AppConnection.Northflank as const,
    methods: Object.values(NorthflankConnectionMethod)
  };
};

export const validateNorthflankConnectionCredentials = async (config: TNorthflankConnectionConfig) => {
  const { credentials } = config;

  try {
    await request.get(`${NORTHFLANK_API_URL}/v1/projects`, {
      headers: {
        Authorization: `Bearer ${credentials.apiToken}`,
        Accept: "application/json"
      }
    });
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to validate Northflank credentials: ${error.message || "Unknown error"}`
      });
    }

    throw new BadRequestError({
      message: `Failed to validate Northflank credentials - verify API token is correct`
    });
  }

  return credentials;
};

export const listProjects = async (appConnection: TNorthflankConnection): Promise<TNorthflankProject[]> => {
  const { credentials } = appConnection;

  try {
    return await $paginateNorthflank<TNorthflankProject>({
      url: `${NORTHFLANK_API_URL}/v1/projects`,
      apiToken: credentials.apiToken,
      key: "projects"
    });
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to list Northflank projects: ${error.message || "Unknown error"}`
      });
    }

    throw new BadRequestError({
      message: "Unable to list Northflank projects",
      error
    });
  }
};

export const listSecretGroups = async (
  appConnection: TNorthflankConnection,
  projectId: string
): Promise<TNorthflankSecretGroup[]> => {
  const { credentials } = appConnection;

  try {
    return await $paginateNorthflank<TNorthflankSecretGroup>({
      url: `${NORTHFLANK_API_URL}/v1/projects/${projectId}/secrets`,
      apiToken: credentials.apiToken,
      key: "secrets"
    });
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to list Northflank secret groups: ${error.message || "Unknown error"}`
      });
    }

    throw new BadRequestError({
      message: "Unable to list Northflank secret groups",
      error
    });
  }
};
