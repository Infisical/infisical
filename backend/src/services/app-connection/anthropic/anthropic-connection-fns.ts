import { request } from "@app/lib/config/request";
import { UnauthorizedError } from "@app/lib/errors";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { AnthropicConnectionMethod } from "./anthropic-connection-enums";
import { TAnthropicConnectionConfig } from "./anthropic-connection-types";

export const ANTHROPIC_API_BASE_URL = "https://api.anthropic.com/v1";

export const getAnthropicConnectionListItem = () => {
  return {
    name: "Anthropic" as const,
    app: AppConnection.Anthropic as const,
    methods: Object.values(AnthropicConnectionMethod) as [AnthropicConnectionMethod.ApiKey]
  };
};

export const validateAnthropicConnectionCredentials = async (config: TAnthropicConnectionConfig) => {
  const { apiKey } = config.credentials;

  try {
    await request.get(`${ANTHROPIC_API_BASE_URL}/models`, {
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      validateStatus: (status) => status === 200
    });
  } catch {
    throw new UnauthorizedError({
      message: "Unable to validate connection: invalid API key"
    });
  }

  return config.credentials;
};
