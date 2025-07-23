import { AxiosError } from "axios";

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

interface BitbucketWorkspacesResponse {
  values: TBitbucketWorkspace[];
  next?: string;
}

export const listBitbucketWorkspaces = async (appConnection: TBitbucketConnection) => {
  const { email, apiToken } = appConnection.credentials;

  const headers = {
    Authorization: createAuthHeader(email, apiToken),
    Accept: "application/json"
  };

  let allWorkspaces: TBitbucketWorkspace[] = [];
  let nextUrl: string | undefined = `${IntegrationUrls.BITBUCKET_API_URL}/2.0/workspaces?pagelen=100`;
  let iterationCount = 0;

  // Limit to 10 iterations, fetching at most 10 * 100 = 1000 workspaces
  while (nextUrl && iterationCount < 10) {
    // eslint-disable-next-line no-await-in-loop
    const { data }: { data: BitbucketWorkspacesResponse } = await request.get<BitbucketWorkspacesResponse>(nextUrl, {
      headers
    });

    allWorkspaces = allWorkspaces.concat(data.values.map((workspace) => ({ slug: workspace.slug })));
    nextUrl = data.next;
    iterationCount += 1;
  }

  return allWorkspaces;
};

interface BitbucketRepositoriesResponse {
  values: TBitbucketRepo[];
  next?: string;
}

export const listBitbucketRepositories = async (appConnection: TBitbucketConnection, workspaceSlug: string) => {
  const { email, apiToken } = appConnection.credentials;

  const headers = {
    Authorization: createAuthHeader(email, apiToken),
    Accept: "application/json"
  };

  let allRepos: TBitbucketRepo[] = [];
  let nextUrl: string | undefined =
    `${IntegrationUrls.BITBUCKET_API_URL}/2.0/repositories/${encodeURIComponent(workspaceSlug)}?pagelen=100`;
  let iterationCount = 0;

  // Limit to 10 iterations, fetching at most 10 * 100 = 1000 repositories
  while (nextUrl && iterationCount < 10) {
    // eslint-disable-next-line no-await-in-loop
    const { data }: { data: BitbucketRepositoriesResponse } = await request.get<BitbucketRepositoriesResponse>(
      nextUrl,
      {
        headers
      }
    );

    allRepos = allRepos.concat(data.values);
    nextUrl = data.next;
    iterationCount += 1;
  }

  return allRepos;
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

  const environments: TBitbucketEnvironment[] = [];
  let hasNextPage = true;

  let environmentsUrl = `${IntegrationUrls.BITBUCKET_API_URL}/2.0/repositories/${encodeURIComponent(workspaceSlug)}/${encodeURIComponent(repositorySlug)}/environments?pagelen=100`;

  let iterationCount = 0;
  // Limit to 10 iterations, fetching at most 10 * 100 = 1000 environments
  while (hasNextPage && iterationCount < 10) {
    // eslint-disable-next-line no-await-in-loop
    const { data }: { data: { values: TBitbucketEnvironment[]; next: string } } = await request.get(environmentsUrl, {
      headers
    });

    if (data?.values.length > 0) {
      environments.push(...data.values);
    }

    if (data.next) {
      environmentsUrl = data.next;
    } else {
      hasNextPage = false;
    }
    iterationCount += 1;
  }

  return environments;
};
