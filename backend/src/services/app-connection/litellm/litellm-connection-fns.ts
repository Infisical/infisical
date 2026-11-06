import { BadRequestError, UnauthorizedError } from "@app/lib/errors";
import { removeTrailingSlash } from "@app/lib/fn/string";
import { logger } from "@app/lib/logger";
import { safeRequest } from "@app/lib/validator";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { LiteLLMConnectionMethod } from "./litellm-connection-enums";
import { TLiteLLMConnection, TLiteLLMConnectionConfig } from "./litellm-connection-types";

export const getLiteLLMConnectionListItem = () => {
  return {
    name: "LiteLLM" as const,
    app: AppConnection.LiteLLM as const,
    methods: Object.values(LiteLLMConnectionMethod) as [LiteLLMConnectionMethod.ApiKey]
  };
};

export const validateLiteLLMConnectionCredentials = async (config: TLiteLLMConnectionConfig) => {
  const { apiKey, instanceUrl } = config.credentials;
  const baseUrl = removeTrailingSlash(instanceUrl);
  const headers = { Authorization: `Bearer ${apiKey}` };

  // safeRequest guards the user-supplied host against SSRF (blocks localhost/private IPs outside of dev mode)
  try {
    const { status } = await safeRequest.get(`${baseUrl}/key/info`, {
      headers,
      validateStatus: (code) => code === 200 || code === 404
    });

    // The proxy master key is read from LITELLM_MASTER_KEY and has no row in LiteLLM's key table, so
    // /key/info authenticates it but then 404s. /user/list confirms it is a valid admin key instead, and
    // its body shape confirms the 200 came from LiteLLM rather than a wrong host that also 404s /key/info.
    if (status === 404) {
      const { data } = await safeRequest.get<{ users?: unknown }>(`${baseUrl}/user/list`, {
        headers,
        params: { page_size: 1 },
        validateStatus: (code) => code === 200
      });

      if (!Array.isArray(data?.users)) {
        throw new Error("Instance did not return a LiteLLM user list");
      }
    }
  } catch (error: unknown) {
    logger.error(
      { errorMessage: error instanceof Error ? error.message : "Unknown error" },
      "Failed to validate LiteLLM connection credentials"
    );
    if (error instanceof BadRequestError) {
      throw error;
    }

    throw new UnauthorizedError({
      message: "Unable to validate connection: invalid API key or instance URL"
    });
  }

  return config.credentials;
};

type TLiteLLMListItem = { id: string; name: string };

// Number of records to return when no search term is provided (dropdown preview),
// vs. when the user is actively searching (LiteLLM caps page_size at 100).
const LITELLM_LIST_PREVIEW_LIMIT = 10;
const LITELLM_LIST_SEARCH_LIMIT = 50;

const getLiteLLMBaseUrl = (connection: TLiteLLMConnection) => removeTrailingSlash(connection.credentials.instanceUrl);

const getLiteLLMErrorMessage = (error: unknown) => (error instanceof Error ? error.message : "Unknown error");

export const listLiteLLMUsers = async (
  connection: TLiteLLMConnection,
  search?: string
): Promise<TLiteLLMListItem[]> => {
  const baseUrl = getLiteLLMBaseUrl(connection);

  try {
    const { data } = await safeRequest.get<{
      users?: { user_id: string; user_email?: string | null; user_alias?: string | null }[];
    }>(`${baseUrl}/user/list`, {
      // LiteLLM filters users by partial email match via `user_email`.
      params: {
        page_size: search ? LITELLM_LIST_SEARCH_LIMIT : LITELLM_LIST_PREVIEW_LIMIT,
        ...(search ? { user_email: search } : {})
      },
      headers: { Authorization: `Bearer ${connection.credentials.apiKey}` }
    });

    return (data.users ?? []).map((user) => ({
      id: user.user_id,
      name: user.user_email || user.user_alias || user.user_id
    }));
  } catch (error: unknown) {
    throw new BadRequestError({ message: `Failed to list LiteLLM users: ${getLiteLLMErrorMessage(error)}` });
  }
};

export const listLiteLLMTeams = async (
  connection: TLiteLLMConnection,
  search?: string
): Promise<TLiteLLMListItem[]> => {
  const baseUrl = getLiteLLMBaseUrl(connection);

  try {
    const { data } = await safeRequest.get<{
      teams?: { team_id: string; team_alias?: string | null }[];
    }>(`${baseUrl}/v2/team/list`, {
      // LiteLLM filters teams by partial alias match via `team_alias`.
      params: {
        page_size: search ? LITELLM_LIST_SEARCH_LIMIT : LITELLM_LIST_PREVIEW_LIMIT,
        ...(search ? { team_alias: search } : {})
      },
      headers: { Authorization: `Bearer ${connection.credentials.apiKey}` }
    });

    return (data.teams ?? []).map((team) => ({
      id: team.team_id,
      name: team.team_alias || team.team_id
    }));
  } catch (error: unknown) {
    throw new BadRequestError({ message: `Failed to list LiteLLM teams: ${getLiteLLMErrorMessage(error)}` });
  }
};

export const listLiteLLMModels = async (connection: TLiteLLMConnection): Promise<TLiteLLMListItem[]> => {
  const baseUrl = getLiteLLMBaseUrl(connection);

  try {
    const { data } = await safeRequest.get<{ data?: { id: string }[] }>(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${connection.credentials.apiKey}` }
    });

    return (data.data ?? []).map((model) => ({ id: model.id, name: model.id }));
  } catch (error: unknown) {
    throw new BadRequestError({ message: `Failed to list LiteLLM models: ${getLiteLLMErrorMessage(error)}` });
  }
};
