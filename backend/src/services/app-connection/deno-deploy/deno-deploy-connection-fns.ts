/* eslint-disable no-await-in-loop */
import { isAxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";

import { DenoDeployConnectionMethod } from "./deno-deploy-connection-enums";
import { TDenoDeployApp, TDenoDeployConnection, TDenoDeployConnectionConfig } from "./deno-deploy-connection-types";

export const DENO_DEPLOY_APPS_PAGE_SIZE = 100;
export const DENO_DEPLOY_APPS_MAX_PAGES = 20;

export const getDenoDeployAuthHeaders = (accessToken: string) => ({
  Authorization: `Bearer ${accessToken}`,
  Accept: "application/json"
});

export const getDenoDeployConnectionListItem = () => {
  return {
    name: "Deno Deploy" as const,
    app: AppConnection.DenoDeploy as const,
    methods: Object.values(DenoDeployConnectionMethod) as [DenoDeployConnectionMethod.AccessToken]
  };
};

const getNextCursorFromLinkHeader = (linkHeader: unknown): string | undefined => {
  if (typeof linkHeader !== "string" || !linkHeader) return undefined;

  const nextPart = linkHeader.split(",").find((part) => part.includes('rel="next"') || part.includes("rel=next"));
  if (!nextPart) return undefined;

  const start = nextPart.indexOf("<");
  const end = nextPart.indexOf(">", start + 1);
  if (start === -1 || end === -1) return undefined;

  try {
    const nextUrl = new URL(nextPart.slice(start + 1, end));
    return nextUrl.searchParams.get("cursor") || undefined;
  } catch {
    return undefined;
  }
};

export const toDenoDeployProviderError = (error: unknown, action: string) => {
  if (error instanceof BadRequestError) return error;

  if (isAxiosError(error)) {
    const status = error.response?.status;
    if (status === 401 || status === 403) {
      return new BadRequestError({
        message: `Unable to ${action}: the Deno Deploy access token was rejected. Verify the token and try again.`
      });
    }
    if (status) {
      return new BadRequestError({
        message: `Unable to ${action}: Deno Deploy returned ${status}. Verify the access token and try again.`
      });
    }
    return new BadRequestError({
      message: `Unable to ${action}: could not reach Deno Deploy. Verify the access token and try again.`
    });
  }

  return new BadRequestError({
    message: `Unable to ${action}: verify the access token and try again.`
  });
};

export const validateDenoDeployConnectionCredentials = async (config: TDenoDeployConnectionConfig) => {
  const { accessToken, organizationId } = config.credentials;

  try {
    await request.get<TDenoDeployApp[]>(`${IntegrationUrls.DENO_DEPLOY_API_URL}/v2/apps`, {
      params: { limit: 1 },
      headers: getDenoDeployAuthHeaders(accessToken)
    });
  } catch (error: unknown) {
    throw toDenoDeployProviderError(error, "validate connection");
  }

  return {
    accessToken,
    ...(organizationId ? { organizationId } : {})
  };
};

export const listDenoDeployApps = async (appConnection: TDenoDeployConnection): Promise<TDenoDeployApp[]> => {
  const { accessToken } = appConnection.credentials;
  const apps: TDenoDeployApp[] = [];
  let cursor: string | undefined;

  try {
    for (let page = 0; page < DENO_DEPLOY_APPS_MAX_PAGES; page += 1) {
      const { data, headers } = await request.get<TDenoDeployApp[]>(`${IntegrationUrls.DENO_DEPLOY_API_URL}/v2/apps`, {
        params: {
          limit: DENO_DEPLOY_APPS_PAGE_SIZE,
          ...(cursor ? { cursor } : {})
        },
        headers: getDenoDeployAuthHeaders(accessToken)
      });

      apps.push(
        ...data.map((app) => ({
          id: app.id,
          slug: app.slug
        }))
      );

      cursor = getNextCursorFromLinkHeader(headers.link);
      if (!cursor) return apps;
    }
  } catch (error) {
    throw toDenoDeployProviderError(error, "list Deno Deploy apps");
  }

  logger.warn(
    { appCount: apps.length },
    `Stopped listing Deno Deploy apps after ${DENO_DEPLOY_APPS_MAX_PAGES} pages; some apps were not returned`
  );

  return apps;
};
