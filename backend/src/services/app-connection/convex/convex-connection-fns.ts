/* eslint-disable no-await-in-loop */
import { isAxiosError } from "axios";

import { BadRequestError, UnauthorizedError } from "@app/lib/errors";
import { removeTrailingSlash } from "@app/lib/fn";
import { logger } from "@app/lib/logger";
import { safeRequest } from "@app/lib/validator";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { ConvexConnectionMethod } from "./convex-connection-enums";
import {
  TConvexApiDeployment,
  TConvexConnection,
  TConvexConnectionConfig,
  TConvexDeployment
} from "./convex-connection-types";

export const CONVEX_API_BASE_URL = "https://api.convex.dev";

const CONVEX_DEPLOYMENT_PAGE_SIZE = 100;
const CONVEX_DEPLOYMENT_MAX_PAGES = 50;

export const getConvexConnectionListItem = () => {
  return {
    name: "Convex" as const,
    app: AppConnection.Convex as const,
    methods: Object.values(ConvexConnectionMethod) as [ConvexConnectionMethod.PersonalAccessToken]
  };
};

const getConvexApiBaseUrl = ({ instanceUrl }: TConvexConnection["credentials"]) =>
  removeTrailingSlash(instanceUrl || CONVEX_API_BASE_URL);

const getConvexApiHeaders = (accessToken: string) => ({
  Authorization: `Bearer ${accessToken}`,
  Accept: "application/json"
});

// A deployment's own API takes the same token under its own scheme
export const getConvexDeploymentHeaders = (accessToken: string) => ({
  Authorization: `Convex ${accessToken}`,
  Accept: "application/json"
});

export const getConvexErrorMessage = (error: unknown) => {
  if (isAxiosError<{ message?: unknown }>(error)) {
    const message = error.response?.data?.message;
    return typeof message === "string" && message ? message : error.message;
  }

  return error instanceof Error ? error.message : "Unknown error";
};

export const validateConvexConnectionCredentials = async (config: TConvexConnectionConfig) => {
  const { accessToken } = config.credentials;

  try {
    await safeRequest.get(`${getConvexApiBaseUrl(config.credentials)}/v1/list_personal_access_tokens`, {
      headers: getConvexApiHeaders(accessToken),
      validateStatus: (status) => status === 200
    });
  } catch (e) {
    if (e instanceof BadRequestError) throw e;
    logger.error({ error: getConvexErrorMessage(e) }, "failed to connect");
    throw new UnauthorizedError({
      message: "Unable to validate connection: verify that your access token and instance URL are correct"
    });
  }

  return config.credentials;
};

// Convex documents no endpoint that lists a personal access token's teams (token_details only answers
// OAuth team tokens), so this reads the one its dashboard uses
const listConvexTeamIds = async (baseUrl: string, headers: Record<string, string>) => {
  const { data } = await safeRequest.get<{ id: number }[]>(`${baseUrl}/api/dashboard/teams`, { headers });

  return data.map((team) => team.id);
};

const listConvexTeamDeployments = async (baseUrl: string, headers: Record<string, string>, teamId: number) => {
  const deployments: TConvexApiDeployment[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < CONVEX_DEPLOYMENT_MAX_PAGES; page += 1) {
    const { data } = await safeRequest.get<{
      items: TConvexApiDeployment[];
      pagination: { hasMore: boolean; nextCursor?: string | null };
    }>(`${baseUrl}/v1/teams/${teamId}/list_deployments`, {
      headers,
      params: { limit: CONVEX_DEPLOYMENT_PAGE_SIZE, cursor }
    });

    deployments.push(...data.items);

    if (!data.pagination.hasMore || !data.pagination.nextCursor) return deployments;
    cursor = data.pagination.nextCursor;
  }

  throw new Error(
    `Convex returned more than ${CONVEX_DEPLOYMENT_MAX_PAGES * CONVEX_DEPLOYMENT_PAGE_SIZE} deployments for one team, which exceeds the listing cap.`
  );
};

export const listConvexDeployments = async ({
  credentials
}: Pick<TConvexConnection, "credentials">): Promise<TConvexDeployment[]> => {
  const baseUrl = getConvexApiBaseUrl(credentials);
  const headers = getConvexApiHeaders(credentials.accessToken);

  const teamIds = await listConvexTeamIds(baseUrl, headers);
  const teamDeployments = await Promise.all(
    teamIds.map((teamId) => listConvexTeamDeployments(baseUrl, headers, teamId))
  );

  // Local deployments run on a developer's machine and have no URL Infisical could reach
  return teamDeployments
    .flat()
    .filter((deployment) => deployment.deploymentUrl)
    .map(({ name, deploymentType }) => ({ name, deploymentType }));
};

// The URL comes from Convex, answering for the connection's own token, so a sync can never send that token to a
// host chosen in its configuration
export const getConvexDeploymentUrl = async (
  { credentials }: Pick<TConvexConnection, "credentials">,
  deploymentName: string
) => {
  const { data } = await safeRequest.get<TConvexApiDeployment>(
    `${getConvexApiBaseUrl(credentials)}/v1/deployments/${encodeURIComponent(deploymentName)}`,
    { headers: getConvexApiHeaders(credentials.accessToken) }
  );

  if (!data.deploymentUrl) {
    throw new BadRequestError({
      message: `Convex deployment '${deploymentName}' is not a cloud deployment, so Infisical cannot reach it. Choose a cloud deployment.`
    });
  }

  return removeTrailingSlash(data.deploymentUrl);
};
