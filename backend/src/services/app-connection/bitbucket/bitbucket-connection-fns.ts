import { AxiosError, HttpStatusCode } from "axios";

import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { logger, sanitizeUrlForLog } from "@app/lib/logger";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";

import { BitbucketConnectionMethod } from "./bitbucket-connection-enums";
import {
  TBitbucketConnection,
  TBitbucketConnectionConfig,
  TBitbucketEnvironment,
  TBitbucketRepo,
  TBitbucketWorkspace
} from "./bitbucket-connection-types";

const BITBUCKET_MAX_PAGES = 10;
const BITBUCKET_PAGE_SIZE = 100;

const ensureBitbucketRateLimitNotExceeded = (error: unknown): never => {
  if (error instanceof AxiosError && error.response?.status === HttpStatusCode.TooManyRequests) {
    throw new BadRequestError({
      message:
        "Request to Bitbucket was blocked due to rate limiting. Bitbucket's rate limit window is 1 hour. Please try again later."
    });
  }
  throw error;
};

export const getBitbucketConnectionListItem = () => {
  return {
    name: "Bitbucket" as const,
    app: AppConnection.Bitbucket as const,
    methods: Object.values(BitbucketConnectionMethod) as [BitbucketConnectionMethod.ApiToken]
  };
};

export const createAuthHeader = (email: string, apiToken: string): string => {
  return `Basic ${Buffer.from(`${email}:${apiToken}`).toString("base64")}`;
};

export const getBitbucketUser = async ({ email, apiToken }: { email: string; apiToken: string }) => {
  try {
    const { data } = await request.get<{ username: string }>(`${IntegrationUrls.BITBUCKET_API_URL}/2.0/user`, {
      headers: {
        Authorization: createAuthHeader(email, apiToken),
        Accept: "application/json"
      }
    });

    return data;
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to validate credentials: ${error.message || "Unknown error"}`
      });
    }
    throw new BadRequestError({
      message: "Unable to validate connection: verify credentials"
    });
  }
};

export const validateBitbucketConnectionCredentials = async (config: TBitbucketConnectionConfig) => {
  await getBitbucketUser(config.credentials);
  return config.credentials;
};

interface BitbucketWorkspaceMembership {
  workspace: { slug: string };
}

interface BitbucketPaginatedResponse<T> {
  values: T[];
  next?: string;
}

const paginateBitbucketRequest = async <T>(url: string, headers: Record<string, string>): Promise<T[]> => {
  let allItems: T[] = [];
  let nextUrl: string | undefined = url;
  let iterationCount = 0;

  try {
    while (nextUrl && iterationCount < BITBUCKET_MAX_PAGES) {
      // eslint-disable-next-line no-await-in-loop
      const { data }: { data: BitbucketPaginatedResponse<T> } = await request.get(nextUrl, { headers });

      allItems = allItems.concat(data.values);
      nextUrl = data.next;
      iterationCount += 1;
    }

    if (nextUrl) {
      logger.warn(
        `Stopped listing Bitbucket resources from ${sanitizeUrlForLog(url)} after ${BITBUCKET_MAX_PAGES} pages; some results were not returned`
      );
    }
  } catch (error) {
    ensureBitbucketRateLimitNotExceeded(error);
  }

  return allItems;
};

export const listBitbucketWorkspaces = async (
  appConnection: TBitbucketConnection,
  search?: string
): Promise<TBitbucketWorkspace[]> => {
  const { email, apiToken } = appConnection.credentials;

  const headers = {
    Authorization: createAuthHeader(email, apiToken),
    Accept: "application/json"
  };

  const baseUrl = new URL(`${IntegrationUrls.BITBUCKET_API_URL}/2.0/user/workspaces`);
  baseUrl.searchParams.set("pagelen", BITBUCKET_PAGE_SIZE.toString());
  if (search) {
    baseUrl.searchParams.set("q", `slug ~ "${search.replace(/"/g, "")}"`);
  }

  const memberships = await paginateBitbucketRequest<BitbucketWorkspaceMembership>(baseUrl.toString(), headers);
  return memberships.map((membership) => ({ slug: membership.workspace.slug }));
};

export const listBitbucketRepositories = async (
  appConnection: TBitbucketConnection,
  workspaceSlug: string,
  search?: string
): Promise<TBitbucketRepo[]> => {
  const { email, apiToken } = appConnection.credentials;

  const headers = {
    Authorization: createAuthHeader(email, apiToken),
    Accept: "application/json"
  };

  const encodedSlug = encodeURIComponent(workspaceSlug);
  const baseUrl = new URL(`${IntegrationUrls.BITBUCKET_API_URL}/2.0/repositories/${encodedSlug}`);
  baseUrl.searchParams.set("pagelen", String(BITBUCKET_PAGE_SIZE));
  baseUrl.searchParams.set("sort", "slug");
  if (search) {
    baseUrl.searchParams.set("q", `name ~ "${search.replace(/"/g, "")}"`);
  }

  return paginateBitbucketRequest<TBitbucketRepo>(baseUrl.toString(), headers);
};

export const listBitbucketEnvironments = async (
  appConnection: TBitbucketConnection,
  workspaceSlug: string,
  repositorySlug: string
): Promise<TBitbucketEnvironment[]> => {
  const { email, apiToken } = appConnection.credentials;

  const headers = {
    Authorization: createAuthHeader(email, apiToken),
    Accept: "application/json"
  };

  return paginateBitbucketRequest<TBitbucketEnvironment>(
    `${IntegrationUrls.BITBUCKET_API_URL}/2.0/repositories/${encodeURIComponent(workspaceSlug)}/${encodeURIComponent(repositorySlug)}/environments?pagelen=${BITBUCKET_PAGE_SIZE}`,
    headers
  );
};
