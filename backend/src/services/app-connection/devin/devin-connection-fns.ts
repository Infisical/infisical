import { AxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";

import { DevinConnectionMethod } from "./devin-connection-enums";
import { TDevinConnectionConfig } from "./devin-connection-types";

export const getDevinConnectionListItem = () => {
  return {
    name: "Devin" as const,
    app: AppConnection.Devin as const,
    methods: Object.values(DevinConnectionMethod) as [DevinConnectionMethod.ApiKey]
  };
};

export const validateDevinConnectionCredentials = async (config: TDevinConnectionConfig) => {
  const { apiKey } = config.credentials;

  try {
    await request.get(`${IntegrationUrls.DEVIN_API_URL}/v3/self`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json"
      }
    });
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to validate credentials: ${error.message || "Unknown error"}`
      });
    }
    throw new BadRequestError({
      message: "Unable to validate connection: verify credentials"
    });
  }

  return config.credentials;
};
