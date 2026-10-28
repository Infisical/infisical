/* eslint-disable no-await-in-loop */
import { isAxiosError } from "axios";

import { BadRequestError, UnauthorizedError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { safeRequest } from "@app/lib/validator";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { ConvexConnectionMethod } from "./convex-connection-enums";
import { TConvexConnection, TConvexConnectionConfig, TConvexDeployment } from "./convex-connection-types";
import { normalizeConvexDeploymentUrl } from "./convex-url";

export { normalizeConvexDeploymentUrl } from "./convex-url";

export const CONVEX_API_BASE_URL = "https://api.convex.dev";

export const getConvexConnectionListItem = () => {
  return {
    name: "Convex" as const,
    app: AppConnection.Convex as const,
    methods: Object.values(ConvexConnectionMethod) as [ConvexConnectionMethod.PersonalAccessToken]
  };
};

export const getConvexErrorMessage = (error: unknown) => {
  if (isAxiosError(error)) {
    const data: unknown = error.response?.data;
    if (typeof data === "string" && data.trim()) return data.trim();
    if (
      data &&
      typeof data === "object" &&
      "message" in data &&
      typeof data.message === "string" &&
      data.message.trim()
    ) {
      return data.message.trim();
    }
    if (error.response?.status) return `Convex returned HTTP ${error.response.status}`;
    return error.message;
  }

  return error instanceof Error ? error.message : "Unknown error";
};

export const validateConvexConnectionCredentials = async (config: TConvexConnectionConfig) => {
  const { accessToken, instanceUrl } = config.credentials;
  const baseUrl = (instanceUrl || CONVEX_API_BASE_URL).replace(/\/+$/, "");

  try {
    await safeRequest.get(`${baseUrl}/v1/list_personal_access_tokens`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      validateStatus: (status) => status === 200
    });
  } catch (e) {
    if (e instanceof BadRequestError) throw e;
    logger.error({ error: e instanceof Error ? e.message : "Unknown error" }, "failed to connect");
    throw new UnauthorizedError({
      message: "Unable to validate connection: verify that your access token and instance URL are correct"
    });
  }

  return config.credentials;
};

const CONVEX_DEPLOYMENT_PAGE_SIZE = 100;
const CONVEX_DEPLOYMENT_MAX_PAGES = 50;

const getConvexManagementHeaders = (accessToken: string) => ({
  Authorization: `Bearer ${accessToken}`,
  Accept: "application/json",
  "Content-Type": "application/json"
});

const toDeployment = (item: unknown): TConvexDeployment | null => {
  if (!item || typeof item !== "object") return null;
  const candidate = item as {
    deploymentUrl?: unknown;
    deployment_url?: unknown;
    name?: unknown;
    deploymentType?: unknown;
    deployment_type?: unknown;
  };
  let deploymentUrl: string | null = null;
  if (typeof candidate.deploymentUrl === "string") {
    deploymentUrl = candidate.deploymentUrl;
  } else if (typeof candidate.deployment_url === "string") {
    deploymentUrl = candidate.deployment_url;
  }
  if (!deploymentUrl || !deploymentUrl.startsWith("https://")) {
    return null;
  }
  if (typeof candidate.name !== "string" || !candidate.name.trim()) return null;

  let normalizedUrl: string;
  try {
    normalizedUrl = normalizeConvexDeploymentUrl(deploymentUrl);
  } catch {
    return null;
  }

  let deploymentType = "custom";
  if (typeof candidate.deploymentType === "string") {
    deploymentType = candidate.deploymentType;
  } else if (typeof candidate.deployment_type === "string") {
    deploymentType = candidate.deployment_type;
  }

  return {
    deploymentUrl: normalizedUrl,
    name: candidate.name.trim(),
    deploymentType
  };
};

const uniqueDeployments = (deployments: TConvexDeployment[]) => {
  const seen = new Set<string>();
  const unique: TConvexDeployment[] = [];
  for (const deployment of deployments) {
    if (!seen.has(deployment.deploymentUrl)) {
      seen.add(deployment.deploymentUrl);
      unique.push(deployment);
    }
  }
  return unique;
};

const listDeploymentsForTeam = async (baseUrl: string, headers: Record<string, string>, teamId: number | string) => {
  const deployments: TConvexDeployment[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < CONVEX_DEPLOYMENT_MAX_PAGES; page += 1) {
    const currentCursor = cursor;
    const { data } = await safeRequest.get<{
      items?: unknown[];
      pagination?: { hasMore?: boolean; nextCursor?: string | null };
    }>(`${baseUrl}/v1/teams/${teamId}/list_deployments`, {
      headers,
      params: {
        limit: CONVEX_DEPLOYMENT_PAGE_SIZE,
        ...(currentCursor ? { cursor: currentCursor } : {})
      }
    });

    for (const item of data.items ?? []) {
      const deployment = toDeployment(item);
      if (deployment) deployments.push(deployment);
    }

    if (!data.pagination?.hasMore || !data.pagination.nextCursor) {
      return deployments;
    }
    cursor = data.pagination.nextCursor;
  }

  throw new Error(
    `Convex returned more than ${CONVEX_DEPLOYMENT_MAX_PAGES * CONVEX_DEPLOYMENT_PAGE_SIZE} deployments for a team, which exceeds the listing cap.`
  );
};

const asUnknownArray = (value: unknown): unknown[] | null => (Array.isArray(value) ? value : null);

const listDeploymentsForProject = async (
  baseUrl: string,
  headers: Record<string, string>,
  projectId: string | number
) => {
  const { data } = await safeRequest.get<unknown>(`${baseUrl}/v1/projects/${projectId}/list_deployments`, { headers });
  const items = asUnknownArray(data) ?? asUnknownArray((data as { items?: unknown })?.items) ?? [];
  const deployments: TConvexDeployment[] = [];
  for (const item of items) {
    const deployment = toDeployment(item);
    if (deployment) deployments.push(deployment);
  }
  return deployments;
};

const extractTeamIds = (data: unknown): Array<number | string> => {
  let teams: unknown[] | null = asUnknownArray(data);
  if (!teams && data && typeof data === "object") {
    const payload = data as { teams?: unknown; items?: unknown };
    teams = asUnknownArray(payload.teams) ?? asUnknownArray(payload.items);
  }

  const teamIds: Array<number | string> = [];
  for (const team of teams ?? []) {
    if (team && typeof team === "object") {
      const candidate = team as { id?: unknown; teamId?: unknown; team_id?: unknown };
      const id = candidate.id ?? candidate.teamId ?? candidate.team_id;
      if (typeof id === "number" || typeof id === "string") {
        teamIds.push(id);
      }
    }
  }
  return teamIds;
};

const listDashboardTeamIds = async (baseUrl: string, headers: Record<string, string>, accessToken: string) => {
  let data: unknown;
  try {
    ({ data } = await safeRequest.get<unknown>(`${baseUrl}/api/dashboard/teams`, { headers }));
  } catch (error) {
    if (!isAxiosError(error) || (error.response?.status !== 401 && error.response?.status !== 403)) {
      throw error;
    }
    ({ data } = await safeRequest.get<unknown>(`${baseUrl}/api/dashboard/teams`, {
      headers: {
        ...headers,
        Authorization: `Convex ${accessToken}`
      }
    }));
  }
  return extractTeamIds(data);
};

export const listConvexDeployments = async (
  appConnection: Pick<TConvexConnection, "credentials">
): Promise<TConvexDeployment[]> => {
  const { accessToken, instanceUrl } = appConnection.credentials;
  const baseUrl = (instanceUrl || CONVEX_API_BASE_URL).replace(/\/+$/, "");

  const headers = getConvexManagementHeaders(accessToken);

  try {
    const { data } = await safeRequest.get<{
      teamId?: unknown;
      team_id?: unknown;
      projectId?: unknown;
      project_id?: unknown;
      type?: unknown;
    }>(`${baseUrl}/v1/token_details`, { headers });

    const teamId = data?.teamId ?? data?.team_id;
    const projectId = data?.projectId ?? data?.project_id;

    if (teamId !== undefined && teamId !== null) {
      return uniqueDeployments(await listDeploymentsForTeam(baseUrl, headers, teamId as number | string));
    }

    if (projectId !== undefined && projectId !== null) {
      return uniqueDeployments(await listDeploymentsForProject(baseUrl, headers, projectId as number | string));
    }
  } catch (error) {
    if (
      !isAxiosError(error) ||
      (error.response?.status !== 400 &&
        error.response?.status !== 401 &&
        error.response?.status !== 403 &&
        error.response?.status !== 404)
    ) {
      throw error;
    }
  }

  const teamIds = await listDashboardTeamIds(baseUrl, headers, accessToken);
  const deployments: TConvexDeployment[] = [];
  for (const teamId of teamIds) {
    const teamDeployments = await listDeploymentsForTeam(baseUrl, headers, teamId);
    deployments.push(...teamDeployments);
  }

  return uniqueDeployments(deployments);
};

export const resolveConvexDeploymentDestination = async (
  appConnection: Pick<TConvexConnection, "credentials">,
  destinationConfig: { deploymentUrl?: unknown; deploymentName?: unknown }
) => {
  if (typeof destinationConfig.deploymentUrl !== "string" || !destinationConfig.deploymentUrl.trim()) {
    throw new BadRequestError({
      message: "A Convex deployment is required."
    });
  }

  let deploymentUrl: string;
  try {
    deploymentUrl = normalizeConvexDeploymentUrl(destinationConfig.deploymentUrl);
  } catch {
    throw new BadRequestError({
      message: "Invalid Convex deployment URL."
    });
  }

  if (!deploymentUrl.startsWith("https://")) {
    throw new BadRequestError({
      message: "Deployment URL must use HTTPS."
    });
  }

  let deployments: TConvexDeployment[];
  try {
    deployments = await listConvexDeployments(appConnection);
  } catch (error) {
    if (error instanceof BadRequestError) throw error;
    throw new BadRequestError({
      message: `Failed to verify the Convex deployment against this connection: ${getConvexErrorMessage(error)}`
    });
  }

  const match = deployments.find((deployment) => deployment.deploymentUrl === deploymentUrl);
  if (!match) {
    throw new BadRequestError({
      message:
        "The selected Convex deployment is not available on this connection. Choose a deployment the connection can access."
    });
  }

  return {
    deploymentUrl: match.deploymentUrl,
    deploymentName: match.name
  };
};
