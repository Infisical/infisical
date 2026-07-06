import { request } from "@app/lib/config/request";
import { UnauthorizedError } from "@app/lib/errors";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { FireworksConnectionMethod } from "./fireworks-connection-enums";
import { TFireworksConnectionConfig } from "./fireworks-connection-types";

export const FIREWORKS_API_BASE_URL = "https://api.fireworks.ai";

export const getFireworksConnectionListItem = () => {
  return {
    name: "Fireworks" as const,
    app: AppConnection.Fireworks as const,
    methods: Object.values(FireworksConnectionMethod) as [FireworksConnectionMethod.ApiKey]
  };
};

export const validateFireworksConnectionCredentials = async (config: TFireworksConnectionConfig) => {
  const { apiKey, accountId } = config.credentials;

  try {
    await request.get(`${FIREWORKS_API_BASE_URL}/v1/accounts/${accountId}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`
      },
      validateStatus: (status) => status === 200
    });
  } catch {
    throw new UnauthorizedError({
      message: "Unable to validate connection: invalid API key or account ID"
    });
  }

  return config.credentials;
};
