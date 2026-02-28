import { request } from "@app/lib/config/request";
import { UnauthorizedError } from "@app/lib/errors";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { OpenRouterConnectionMethod } from "./open-router-connection-enums";
import { TOpenRouterConnectionConfig } from "./open-router-connection-types";

export const OPEN_ROUTER_API_BASE_URL = "https://openrouter.ai/api/v1";

export const getOpenRouterConnectionListItem = () => {
  return {
    name: "OpenRouter" as const,
    app: AppConnection.OpenRouter as const,
    methods: Object.values(OpenRouterConnectionMethod) as [OpenRouterConnectionMethod.ApiKey]
  };
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
