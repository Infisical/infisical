import { request } from "@app/lib/config/request";
import { UnauthorizedError } from "@app/lib/errors";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { OpenAIConnectionMethod } from "./openai-connection-enums";
import { TOpenAIConnectionConfig } from "./openai-connection-types";

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
