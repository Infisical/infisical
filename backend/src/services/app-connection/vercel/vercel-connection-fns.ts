/* eslint-disable no-await-in-loop */
import { AxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { BadRequestError, InternalServerError } from "@app/lib/errors";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { TVercelBranches } from "@app/services/integration-auth/integration-auth-types";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";

import { VercelConnectionMethod } from "./vercel-connection-enums";
import {
  TVercelConnection,
  TVercelConnectionConfig,
  VercelApp,
  VercelEnvironment,
  VercelOrgWithApps
} from "./vercel-connection-types";

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
    limit: 10
  };
  return fetchAllPages<VercelApp>({
    apiUrl: `${IntegrationUrls.VERCEL_API_URL}/v10/projects`,
    apiToken,
    initialParams: params,
    dataPath: "projects",
    maxItems: 10
  });
}

async function fetchProjectEnvironments(
  projectId: string,
  teamId: string,
  apiToken: string
): Promise<VercelEnvironment[]> {
  try {
    return await fetchAllPages<VercelEnvironment>({
      apiUrl: `${IntegrationUrls.VERCEL_API_URL}/v10/projects/${projectId}/custom-environments?teamId=${teamId}`,
      initialParams: {},
      dataPath: "environments",
      apiToken
    });
  } catch (error) {
    return [];
  }
}

async function fetchPreviewBranches(projectId: string, apiToken: string): Promise<string[]> {
  try {
    const { data } = await request.get<TVercelBranches[]>(
      `${IntegrationUrls.VERCEL_API_URL}/v1/integrations/git-branches`,
      {
        params: {
          projectId
        },
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Accept-Encoding": "application/json"
        }
      }
    );
    return data.filter((b) => b.ref !== "main").map((b) => b.ref);
  } catch (error) {
    return [];
  }
}

type VercelTeam = {
  id: string;
  name: string;
  slug: string;
};

type VercelUserResponse = {
  user: {
    id: string;
    name: string;
    username: string;
  };
};

export const listProjects = async (
  appConnection: TVercelConnection,
  projectSearch?: string
): Promise<VercelOrgWithApps[]> => {
  const { credentials } = appConnection;
  const { apiToken } = credentials;

  const orgs = await fetchAllPages<VercelTeam>({
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
    orgs.push({
      id: user.id,
      name: user.name || "Personal Account",
      slug: user.username || "personal"
    });
  }

  const orgsWithApps: VercelOrgWithApps[] = [];

  const orgPromises = orgs.map(async (org) => {
    try {
      const projects = await fetchOrgProjects(org.id, apiToken, projectSearch);

      const enhancedProjectsPromises = projects.map(async (project) => {
        try {
          const [environments, previewBranches] = await Promise.all([
            fetchProjectEnvironments(project.name, org.id, apiToken),
            fetchPreviewBranches(project.id, apiToken)
          ]);

          return {
            name: project.name,
            id: project.id,
            envs: environments,
            previewBranches
          };
        } catch (error) {
          return {
            name: project.name,
            id: project.id,
            envs: [],
            previewBranches: []
          };
        }
      });

      const enhancedProjects = await Promise.all(enhancedProjectsPromises);

      return {
        ...org,
        apps: enhancedProjects
      };
    } catch (error) {
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

export const getProjectEnvironmentVariables = (project: VercelApp): Record<string, string> => {
  const envVars: Record<string, string> = {};

  if (!project.envs) return envVars;

  project.envs.forEach((env) => {
    if (env.slug && env.type !== "gitBranch") {
      const { id, slug } = env;
      envVars[id] = slug;
    }
  });

  return envVars;
};
