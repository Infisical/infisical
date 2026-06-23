import { AxiosError, HttpStatusCode } from "axios";

import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
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

interface BitbucketWorkspacesResponse {
  values: BitbucketWorkspaceMembership[];
  next?: string;
}

export const listBitbucketWorkspaces = async (appConnection: TBitbucketConnection, search?: string) => {
  const { email, apiToken } = appConnection.credentials;

  const headers = {
    Authorization: createAuthHeader(email, apiToken),
    Accept: "application/json"
  };

  let allWorkspaces: TBitbucketWorkspace[] = [];

  const baseUrl = new URL(`${IntegrationUrls.BITBUCKET_API_URL}/2.0/user/workspaces`);
  baseUrl.searchParams.set("pagelen", BITBUCKET_PAGE_SIZE.toString());
  if (search) {
    baseUrl.searchParams.set("q", `slug ~ "${search.replace(/"/g, "")}"`);
  }

  const endpoint = baseUrl.toString();
  try {
    const { data }: { data: BitbucketWorkspacesResponse } = await request.get<BitbucketWorkspacesResponse>(endpoint, {
      headers
    });

    allWorkspaces = allWorkspaces.concat(data.values.map((membership) => ({ slug: membership.workspace.slug })));
  } catch (error) {
    ensureBitbucketRateLimitNotExceeded(error);
  }

  return allWorkspaces;
};

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
  } catch (error) {
    ensureBitbucketRateLimitNotExceeded(error);
  }

  return allItems;
};

export const listBitbucketRepositories = async (
  appConnection: TBitbucketConnection,
  workspaceSlug: string,
  search?: string
) => {
  const { email, apiToken } = appConnection.credentials;

  const headers = {
    Authorization: createAuthHeader(email, apiToken),
    Accept: "application/json"
  };

  const encodedSlug = encodeURIComponent(workspaceSlug);

  try {
    const baseUrl = new URL(`${IntegrationUrls.BITBUCKET_API_URL}/2.0/repositories/${encodedSlug}`);
    baseUrl.searchParams.set("pagelen", String(BITBUCKET_PAGE_SIZE));
    baseUrl.searchParams.set("sort", "slug");
    if (search) {
      baseUrl.searchParams.set("q", `name ~ "${search.replace(/"/g, "")}"`);
    }

    const { data } = await request.get<BitbucketPaginatedResponse<TBitbucketRepo>>(baseUrl.toString(), { headers });
    return data.values;
  } catch (error) {
    return ensureBitbucketRateLimitNotExceeded(error);
  }
};

export const listBitbucketEnvironments = async (
  appConnection: TBitbucketConnection,
  workspaceSlug: string,
  repositorySlug: string
) => {
  const { email, apiToken } = appConnection.credentials;

  const headers = {
    Authorization: createAuthHeader(email, apiToken),
    Accept: "application/json"
  };

  // We still need to paginate this one as it's the only endpoint we use that doesn't support searching
  // https://developer.atlassian.com/cloud/bitbucket/rest/api-group-deployments/#api-repositories-workspace-repo-slug-environments-get
  return paginateBitbucketRequest<TBitbucketEnvironment>(
    `${IntegrationUrls.BITBUCKET_API_URL}/2.0/repositories/${encodeURIComponent(workspaceSlug)}/${encodeURIComponent(repositorySlug)}/environments?pagelen=${BITBUCKET_PAGE_SIZE}`,
    headers
  );
};
