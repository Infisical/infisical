/* eslint-disable no-await-in-loop */
import { AxiosError, isAxiosError } from "axios";

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
  VercelOrgWithApps,
  VercelProject,
  VercelTeam,
  VercelUserResponse
} from "./vercel-connection-types";

const VERCEL_MAX_PAGES = 100;

/**
 * Supplies the connection catalog with the Vercel authentication method users
 * can configure before they provide credentials.
 */
export const getVercelConnectionListItem = () => {
  return {
    name: "Vercel" as const,
    app: AppConnection.Vercel as const,
    methods: Object.values(VercelConnectionMethod) as [VercelConnectionMethod.ApiToken]
  };
};

/**
 * Validates credentials against the project API so project-scoped tokens can
 * connect without access to user or team metadata.
 *
 * A successful response with no projects still establishes access to this API.
 * Access to a specific sync destination is evaluated separately.
 *
 * @see https://vercel.com/docs/accounts/access-tokens
 */
export const validateVercelConnectionCredentials = async (config: TVercelConnectionConfig) => {
  const { credentials: inputCredentials } = config;

  try {
    await request.get(`${IntegrationUrls.VERCEL_API_URL}/v10/projects`, {
      params: { limit: 1 },
      headers: {
        Authorization: `Bearer ${inputCredentials.apiToken}`
      }
    });
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      if (error.response?.status === 401 || error.response?.status === 403) {
        throw new BadRequestError({
          message: `Failed to validate the Vercel API token using '${IntegrationUrls.VERCEL_API_URL}/v10/projects'. Verify that the token is valid, has not expired, and has access to the projects you want to sync.`
        });
      }

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
    next: number | null;
  };
  data: T[];
  [key: string]: unknown;
}

/**
 * Normalizes Vercel list responses and follows their pagination cursors.
 * Wrapped lists use the requested data key or `data`; bare arrays end traversal.
 * The page cap prevents a repeating provider cursor from keeping discovery alive
 * indefinitely.
 *
 * The item limit is checked between requests, so each fetched page is retained
 * in full. The original Axios error is preserved for scope-aware recovery.
 */
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
  let pageCount = 0;
  let params: Record<string, string | number> = { limit: 100, ...initialParams };

  while (hasMoreItems && (!maxItems || allItems.length < maxItems)) {
    pageCount += 1;
    if (pageCount > VERCEL_MAX_PAGES) {
      throw new BadRequestError({
        message: `Vercel returned too many pages of results from '${apiUrl}'. Try again later.`
      });
    }

    try {
      const response = await request.get<ApiResponse<T> | T[]>(apiUrl, {
        params,
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Accept-Encoding": "application/json"
        }
      });

      if (!response?.data) {
        throw new InternalServerError({
          message: `Failed to fetch Vercel resources from '${apiUrl}': the response was empty or malformed. Try again later.`
        });
      }

      let itemsData: T[];

      if (Array.isArray(response.data)) {
        itemsData = response.data;
      } else if (dataPath && dataPath in response.data) {
        itemsData = response.data[dataPath] as T[];
      } else {
        itemsData = response.data.data;
      }

      if (!Array.isArray(itemsData)) {
        throw new InternalServerError({
          message: `Failed to fetch Vercel resources from '${apiUrl}': the response did not contain a resource list. Expected array but got ${typeof itemsData}.`
        });
      }

      allItems.push(...itemsData);

      if (!Array.isArray(response.data) && response.data.pagination?.next) {
        params = { ...params, until: response.data.pagination.next };
      } else {
        hasMoreItems = false;
      }
    } catch (error) {
      if (error instanceof AxiosError) {
        throw new BadRequestError({
          error,
          message: `Failed to fetch Vercel resources from '${apiUrl}': ${error.message || "Unknown error"}. Verify the API token's permissions and try again.`
        });
      }
      throw error;
    }
  }

  return allItems;
}

/**
 * Uses a small result window for the searchable destination picker.
 *
 * Omitting the account ID lets Vercel infer the owning team from a scoped token,
 * allowing project discovery when team metadata is inaccessible.
 */
async function fetchOrgProjects(
  orgId: string | undefined,
  apiToken: string,
  projectSearch?: string
): Promise<VercelProject[]> {
  const params: Record<string, string | number> = {
    ...(orgId ? { teamId: orgId } : {}),
    ...(projectSearch ? { search: projectSearch } : {}),
    limit: 10
  };
  return fetchAllPages<VercelProject>({
    apiUrl: `${IntegrationUrls.VERCEL_API_URL}/v10/projects`,
    apiToken,
    initialParams: params,
    dataPath: "projects",
    maxItems: 10
  });
}

/**
 * Loads optional custom-environment metadata for destination selection.
 * Failed discovery yields an empty list so standard environments remain usable.
 *
 * @see https://vercel.com/docs/rest-api/environment/retrieve-custom-environments
 */
async function fetchProjectEnvironments(
  projectId: string,
  teamId: string,
  apiToken: string
): Promise<VercelEnvironment[]> {
  try {
    return await fetchAllPages<VercelEnvironment>({
      apiUrl: `${IntegrationUrls.VERCEL_API_URL}/v9/projects/${projectId}/custom-environments?teamId=${teamId}`,
      initialParams: {},
      dataPath: "environments",
      apiToken
    });
  } catch (error) {
    return [];
  }
}

/**
 * Provides branch suggestions through an endpoint absent from Vercel's public
 * OpenAPI schema. Discovery is best effort, with failures yielding an empty list
 * so projects remain selectable.
 *
 * The filter excludes the literal `main` branch; the project's configured
 * production branch is not resolved by this lookup.
 */
async function fetchPreviewBranches(projectId: string, teamId: string, apiToken: string): Promise<string[]> {
  try {
    const { data } = await request.get<TVercelBranches[]>(
      `${IntegrationUrls.VERCEL_API_URL}/v1/integrations/git-branches`,
      {
        params: {
          projectId,
          teamId
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

/**
 * Identifies discovery failures that permit a scope-aware fallback or omission.
 * A token can access its project while user or team resources remain inaccessible,
 * so HTTP 403 and 404 responses are treated as recoverable scope restrictions.
 *
 * Unwraps Infisical's BadRequestError to inspect the original Axios response.
 * Authentication failures (401), rate limits (429), upstream failures, and network
 * errors remain outside this category so callers can propagate them.
 *
 * This classification guides recovery; credential validity still requires a
 * successful validation request.
 *
 * @see https://vercel.com/docs/accounts/access-tokens
 */
const isVercelScopeError = (error: unknown) => {
  const upstreamError = error instanceof BadRequestError ? error.error : error;
  return (
    isAxiosError(upstreamError) && (upstreamError.response?.status === 403 || upstreamError.response?.status === 404)
  );
};

/**
 * Builds account groups for the destination picker, including a personal account
 * when its metadata is accessible.
 *
 * A scope restriction on the personal-account lookup preserves discovered teams.
 * Team-list failures propagate so the caller can attempt project-only discovery.
 */
export const listTeams = async (appConnection: TVercelConnection): Promise<VercelTeam[]> => {
  const { credentials } = appConnection;
  const { apiToken } = credentials;

  const teams = await fetchAllPages<VercelTeam>({
    apiUrl: `${IntegrationUrls.VERCEL_API_URL}/v2/teams`,
    apiToken,
    initialParams: {},
    dataPath: "teams"
  });

  try {
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
  } catch (error) {
    if (!isVercelScopeError(error)) throw error;
  }

  return teams;
};

/**
 * Enriches a selectable project with custom environments and branch suggestions
 * in parallel. Each lookup tolerates failure independently, preserving whichever
 * optional metadata can be read.
 */
const fetchProjectDetails = async (project: VercelApp, teamId: string, apiToken: string): Promise<VercelApp> => {
  const [envs, previewBranches] = await Promise.all([
    fetchProjectEnvironments(project.id, teamId, apiToken),
    fetchPreviewBranches(project.id, teamId, apiToken)
  ]);

  return { name: project.name, id: project.id, envs, previewBranches };
};

/**
 * Reconstructs destination-picker groups directly from token-accessible projects
 * when user and team metadata cannot be discovered.
 *
 * The project's owning account ID supplies both the group identity and its label.
 * A missing owner is rejected because sync requests need the correct team context.
 */
const listScopedProjects = async (apiToken: string, projectSearch?: string): Promise<VercelOrgWithApps[]> => {
  const projects = await fetchOrgProjects(undefined, apiToken, projectSearch);
  const orgs = new Map<string, VercelOrgWithApps>();

  projects.forEach((project) => {
    if (!project.accountId) {
      throw new BadRequestError({
        message: `Vercel did not return the owning account for project '${project.id}' in the response. Try again later.`
      });
    }

    let org = orgs.get(project.accountId);
    if (!org) {
      org = { id: project.accountId, name: project.accountId, slug: project.accountId, apps: [] };
      orgs.set(project.accountId, org);
    }
    org.apps.push(project);
  });

  return Promise.all(
    Array.from(orgs.values()).map(async (org) => ({
      ...org,
      apps: await Promise.all(org.apps.map((project) => fetchProjectDetails(project, org.id, apiToken)))
    }))
  );
};

/**
 * Prefers readable account metadata for project groups, falling back to direct
 * project discovery when account discovery is restricted or returns no accounts.
 *
 * Accounts outside the token's scope are skipped. Other project-list failures
 * propagate so authentication and provider problems remain visible to callers.
 */
export const listProjects = async (
  appConnection: TVercelConnection,
  projectSearch?: string
): Promise<VercelOrgWithApps[]> => {
  const { credentials } = appConnection;
  const { apiToken } = credentials;

  let orgs: VercelTeam[];
  try {
    orgs = await listTeams(appConnection);
  } catch (error) {
    if (!isVercelScopeError(error)) throw error;
    return listScopedProjects(apiToken, projectSearch);
  }

  if (!orgs.length) return listScopedProjects(apiToken, projectSearch);

  const orgsWithApps: VercelOrgWithApps[] = [];

  const orgPromises = orgs.map(async (org) => {
    try {
      const projects = await fetchOrgProjects(org.id, apiToken, projectSearch);

      const enhancedProjects = await Promise.all(
        projects.map((project) => fetchProjectDetails(project, org.id, apiToken))
      );

      return {
        ...org,
        apps: enhancedProjects
      };
    } catch (error) {
      if (isVercelScopeError(error)) return null;
      throw error;
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

/**
 * Provides environment labels keyed by ID for destination configuration.
 * Branch-specific entries are excluded because branches have their own selector.
 */
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
