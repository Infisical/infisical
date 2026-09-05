/* eslint-disable no-await-in-loop */
import { AxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { BadRequestError, InternalServerError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { TVercelBranches } from "@app/services/integration-auth/integration-auth-types";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";

import { VercelConnectionMethod } from "./vercel-connection-enums";
import {
  TVercelConnection,
  TVercelConnectionConfig,
  VercelApp,
  VercelEnvironment,
  VercelOrgWithApps,
  VercelProject,
  VercelTeam,
  VercelUserResponse
} from "./vercel-connection-types";

const VERCEL_PROJECT_LIST_LIMIT = 100;

export const getVercelConnectionListItem = () => {
  return {
    name: "Vercel" as const,
    app: AppConnection.Vercel as const,
    methods: Object.values(VercelConnectionMethod) as [VercelConnectionMethod.ApiToken]
  };
};

export const validateVercelConnectionCredentials = async (config: TVercelConnectionConfig) => {
  const { credentials: inputCredentials } = config;

  try {
    await request.get(`${IntegrationUrls.VERCEL_API_URL}/v2/user`, {
      headers: {
        Authorization: `Bearer ${inputCredentials.apiToken}`
      }
    });
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        message: `Failed to validate credentials: ${
          error.response?.data ? JSON.stringify(error.response?.data) : error.message || "Unknown error"
        }`
      });
    }
    throw new BadRequestError({
      message: `Unable to validate connection: ${(error as Error).message || "Verify credentials"}`
    });
  }

  return inputCredentials;
};

interface ApiResponse<T> {
  pagination?: {
    count: number;
    next: number;
  };
  data: T[];
  [key: string]: unknown;
}

async function fetchAllPages<T>({
  apiUrl,
  apiToken,
  initialParams,
  dataPath,
  maxItems
}: {
  apiUrl: string;
  apiToken: string;
  initialParams?: Record<string, string | number>;
  dataPath?: string;
  maxItems?: number;
}): Promise<T[]> {
  const allItems: T[] = [];
  let hasMoreItems = true;
  let params: Record<string, string | number> = { limit: 100, ...initialParams };

  while (hasMoreItems && (!maxItems || allItems.length < maxItems)) {
    try {
      const response = await request.get<ApiResponse<T>>(apiUrl, {
        params,
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Accept-Encoding": "application/json"
        }
      });

      if (!response?.data) {
        throw new InternalServerError({
          message: `Failed to fetch data from ${apiUrl}: Response was empty or malformed`
        });
      }

      let itemsData: T[];

      if (dataPath && dataPath in response.data) {
        itemsData = response.data[dataPath] as T[];
      } else {
        itemsData = response.data.data;
      }

      if (!Array.isArray(itemsData)) {
        throw new InternalServerError({
          message: `Failed to fetch data from ${apiUrl}: Expected array but got ${typeof itemsData}`
        });
      }

      allItems.push(...itemsData);

      if (response.data.pagination?.next) {
        params = { ...params, since: response.data.pagination.next };
      } else {
        hasMoreItems = false;
      }
    } catch (error) {
      if (error instanceof AxiosError) {
        throw new BadRequestError({
          message: `Failed to fetch data from ${apiUrl}: ${error.message || "Unknown error"}`
        });
      }
      throw error;
    }
  }

  return allItems;
}

async function fetchOrgProjects(orgId: string, apiToken: string, projectSearch?: string): Promise<VercelApp[]> {
  const params: Record<string, string | number> = {
    teamId: orgId,
    ...(projectSearch ? { search: projectSearch } : {}),
    limit: VERCEL_PROJECT_LIST_LIMIT
  };
  return fetchAllPages<VercelApp>({
    apiUrl: `${IntegrationUrls.VERCEL_API_URL}/v10/projects`,
    apiToken,
    initialParams: params,
    dataPath: "projects",
    maxItems: VERCEL_PROJECT_LIST_LIMIT
  });
}

async function fetchProjectEnvironments(
  projectId: string,
  teamId: string | undefined,
  apiToken: string
): Promise<VercelEnvironment[]> {
  try {
    return await fetchAllPages<VercelEnvironment>({
      apiUrl: `${IntegrationUrls.VERCEL_API_URL}/v10/projects/${projectId}/custom-environments`,
      initialParams: teamId ? { teamId } : {},
      dataPath: "environments",
      apiToken
    });
  } catch (error) {
    logger.warn(error, `Failed to fetch Vercel custom environments for project ${projectId}`);
    return [];
  }
}

async function fetchPreviewBranches(
  projectId: string,
  teamId: string | undefined,
  apiToken: string
): Promise<string[]> {
  try {
    const { data } = await request.get<TVercelBranches[]>(
      `${IntegrationUrls.VERCEL_API_URL}/v1/integrations/git-branches`,
      {
        params: {
          projectId,
          ...(teamId ? { teamId } : {})
        },
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Accept-Encoding": "application/json"
        }
      }
    );
    return data.map((b) => b.ref);
  } catch (error) {
    logger.warn(error, `Failed to fetch Vercel git branches for project ${projectId}`);
    return [];
  }
}

export const listTeams = async (appConnection: TVercelConnection): Promise<VercelTeam[]> => {
  const { credentials } = appConnection;
  const { apiToken } = credentials;

  const teams = await fetchAllPages<VercelTeam>({
    apiUrl: `${IntegrationUrls.VERCEL_API_URL}/v2/teams`,
    apiToken,
    initialParams: {},
    dataPath: "teams"
  });

  const personalAccountResponse = await request.get<VercelUserResponse>(`${IntegrationUrls.VERCEL_API_URL}/v2/user`, {
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Accept-Encoding": "application/json"
    }
  });

  if (personalAccountResponse?.data?.user) {
    const { user } = personalAccountResponse.data;
    teams.push({
      id: user.id,
      name: user.name || "Personal Account",
      slug: user.username || "personal"
    });
  }

  return teams;
};

export const listProjects = async (
  appConnection: TVercelConnection,
  projectSearch?: string
): Promise<VercelOrgWithApps[]> => {
  const { credentials } = appConnection;
  const { apiToken } = credentials;

  const orgs = await listTeams(appConnection);

  const orgsWithApps: VercelOrgWithApps[] = [];

  const orgPromises = orgs.map(async (org) => {
    try {
      const projects = await fetchOrgProjects(org.id, apiToken, projectSearch);

      return {
        ...org,
        apps: projects.map((project) => ({ id: project.id, name: project.name }))
      };
    } catch (error) {
      logger.warn(error, `Failed to fetch Vercel projects for team ${org.id}`);
      return null;
    }
  });

  const results = await Promise.all(orgPromises);

  results.forEach((result) => {
    if (result !== null) {
      orgsWithApps.push(result);
    }
  });

  return orgsWithApps;
};

export const getProject = async (
  appConnection: TVercelConnection,
  projectId: string,
  teamId?: string
): Promise<VercelProject> => {
  const { apiToken } = appConnection.credentials;

  let project: VercelApp;

  try {
    const { data } = await request.get<VercelApp>(
      `${IntegrationUrls.VERCEL_API_URL}/v10/projects/${encodeURIComponent(projectId)}`,
      {
        params: teamId ? { teamId } : {},
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Accept-Encoding": "application/json"
        }
      }
    );
    project = data;
  } catch (error) {
    if (error instanceof AxiosError && error.response?.status === 404) {
      throw new NotFoundError({
        message: `Could not find Vercel project with ID ${projectId}. Verify that the project exists and that the connection's API token has access to it.`
      });
    }

    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to fetch Vercel project ${projectId}: ${error.message || "Unknown error"}`
      });
    }

    throw error;
  }

  const [envs, previewBranches] = await Promise.all([
    fetchProjectEnvironments(project.id, teamId, apiToken),
    fetchPreviewBranches(project.id, teamId, apiToken)
  ]);

  return {
    id: project.id,
    name: project.name,
    envs,
    previewBranches
  };
};
