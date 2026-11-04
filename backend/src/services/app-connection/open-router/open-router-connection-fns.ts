import { AxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { BadRequestError, UnauthorizedError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { OpenRouterConnectionMethod } from "./open-router-connection-enums";
import {
  TOpenRouterConnection,
  TOpenRouterConnectionConfig,
  TOpenRouterListWorkspacesResponse,
  TOpenRouterWorkspace
} from "./open-router-connection-types";

export const OPEN_ROUTER_API_BASE_URL = "https://openrouter.ai/api/v1";

const OPEN_ROUTER_WORKSPACES_PAGE_SIZE = 100;
const OPEN_ROUTER_WORKSPACES_MAX_PAGES = 50;

export const getOpenRouterConnectionListItem = () => {
  return {
    name: "OpenRouter" as const,
    app: AppConnection.OpenRouter as const,
    methods: Object.values(OpenRouterConnectionMethod) as [OpenRouterConnectionMethod.ApiKey]
  };
};

export const listOpenRouterWorkspaces = async (
  appConnection: TOpenRouterConnection
): Promise<Pick<TOpenRouterWorkspace, "id" | "name" | "slug">[]> => {
  const { apiKey } = appConnection.credentials;

  const workspaces: TOpenRouterWorkspace[] = [];

  try {
    let totalCount = 0;

    for (let page = 0; page < OPEN_ROUTER_WORKSPACES_MAX_PAGES; page += 1) {
      // eslint-disable-next-line no-await-in-loop
      const { data } = await request.get<TOpenRouterListWorkspacesResponse>(`${OPEN_ROUTER_API_BASE_URL}/workspaces`, {
        params: { offset: page * OPEN_ROUTER_WORKSPACES_PAGE_SIZE, limit: OPEN_ROUTER_WORKSPACES_PAGE_SIZE },
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        }
      });

      const pageWorkspaces = data.data ?? [];
      workspaces.push(...pageWorkspaces);
      totalCount = data.total_count ?? workspaces.length;

      if (!pageWorkspaces.length || workspaces.length >= totalCount) break;
    }

    if (workspaces.length < totalCount) {
      logger.warn(
        `listOpenRouterWorkspaces: reached page cap [connectionId=${appConnection.id}] [returned=${workspaces.length}] [totalCount=${totalCount}]`
      );
    }
  } catch (error: unknown) {
    const upstreamMessage =
      error instanceof AxiosError
        ? ((error.response?.data as { error?: { message?: string } } | undefined)?.error?.message ?? error.message)
        : "Unknown error";

    throw new BadRequestError({
      message: `Failed to list OpenRouter workspaces: ${upstreamMessage}`
    });
  }

  return workspaces.map(({ id, name, slug }) => ({ id, name, slug }));
};

export const validateOpenRouterConnectionCredentials = async (config: TOpenRouterConnectionConfig) => {
  const { apiKey } = config.credentials;

  try {
    // Validate by attempting to list API keys (requires a valid provisioning key)
    await request.get(`${OPEN_ROUTER_API_BASE_URL}/keys`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      validateStatus: (status) => status === 200
    });
  } catch (error: unknown) {
    throw new UnauthorizedError({
      message: "Unable to validate connection: invalid API key or insufficient permissions"
    });
  }

  return config.credentials;
};
