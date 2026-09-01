import { AxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { BadRequestError, UnauthorizedError } from "@app/lib/errors";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { OpenAIConnectionMethod } from "./openai-connection-enums";
import {
  TOpenAIConnection,
  TOpenAIConnectionConfig,
  TOpenAIListProjectsResponse,
  TOpenAIProject
} from "./openai-connection-types";

export const OPENAI_API_BASE_URL = "https://api.openai.com/v1";

export const getOpenAIConnectionListItem = () => {
  return {
    name: "OpenAI" as const,
    app: AppConnection.OpenAI as const,
    methods: Object.values(OpenAIConnectionMethod) as [OpenAIConnectionMethod.ApiKey]
  };
};

/**
 * Verifies an OpenAI admin API key by listing admin API keys (requires a valid admin key).
 * Resolves on a 200 and throws the underlying request error otherwise, so callers can wrap
 * it in their own domain-specific error.
 */
export const verifyOpenAIAdminApiKey = async (apiKey: string) =>
  request.get(`${OPENAI_API_BASE_URL}/organization/admin_api_keys?limit=1`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    validateStatus: (status) => status === 200
  });

export const listOpenAIProjects = async (
  appConnection: TOpenAIConnection
): Promise<Pick<TOpenAIProject, "id" | "name">[]> => {
  const { apiKey } = appConnection.credentials;
  const PAGE_SIZE = 100;
  const MAX_PAGES = 50;

  const projects: TOpenAIProject[] = [];

  try {
    let after: string | undefined;

    for (let page = 0; page < MAX_PAGES; page += 1) {
      // eslint-disable-next-line no-await-in-loop
      const { data } = await request.get<TOpenAIListProjectsResponse>(`${OPENAI_API_BASE_URL}/organization/projects`, {
        params: { limit: PAGE_SIZE, ...(after ? { after } : {}) },
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        }
      });

      projects.push(...(data.data ?? []).filter((project) => project.status === "active"));

      if (!data.has_more) break;
      after = data.last_id;
    }
  } catch (error: unknown) {
    throw new BadRequestError({
      message: `Failed to list OpenAI projects: ${error instanceof AxiosError ? error.message : "Unknown error"}`
    });
  }

  return projects.map(({ id, name }) => ({ id, name }));
};

export const validateOpenAIConnectionCredentials = async (config: TOpenAIConnectionConfig) => {
  const { apiKey } = config.credentials;

  try {
    await verifyOpenAIAdminApiKey(apiKey);
  } catch (error: unknown) {
    throw new UnauthorizedError({
      message: "Unable to validate connection: invalid API key or insufficient permissions"
    });
  }

  return config.credentials;
};
