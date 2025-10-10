import { AxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";

import { AppConnection } from "../app-connection-enums";
import { LaravelForgeConnectionMethod } from "./laravel-forge-connection-enums";
import { TLaravelForgeConnectionConfig } from "./laravel-forge-connection-types";

export const getLaravelForgeConnectionListItem = () => {
  return {
    name: "Laravel Forge" as const,
    app: AppConnection.LaravelForge as const,
    methods: Object.values(LaravelForgeConnectionMethod) as [LaravelForgeConnectionMethod.ApiToken]
  };
};

export const validateLaravelForgeConnectionCredentials = async (config: TLaravelForgeConnectionConfig) => {
  const { credentials: inputCredentials } = config;

  try {
    // Using the /api/me endpoint to validate the API token
    await request.get(`${IntegrationUrls.LARAVELFORGE_API_URL}/api/me`, {
      headers: {
        Authorization: `Bearer ${inputCredentials.apiToken}`,
        Accept: "application/json",
        "Content-Type": "application/json"
      }
    });
  } catch (error) {
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to validate credentials: ${error.message || "Unknown error"}`
      });
    }
    throw new BadRequestError({
      message: "Unable to validate connection: verify credentials"
    });
  }

  return inputCredentials;
};
