import { AxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";

import { DaytonaConnectionMethod } from "./daytona-connection-enums";
import { TDaytonaConnectionConfig } from "./daytona-connection-types";

const DAYTONA_MANAGE_SECRETS_PERMISSION = "manage:secrets";

export const getDaytonaAuthHeaders = (apiKey: string) => ({
  Authorization: `Bearer ${apiKey}`,
  Accept: "application/json",
  "Content-Type": "application/json"
});

export const getDaytonaConnectionListItem = () => {
  return {
    name: "Daytona" as const,
    app: AppConnection.Daytona as const,
    methods: Object.values(DaytonaConnectionMethod) as [DaytonaConnectionMethod.ApiKey]
  };
};

export const validateDaytonaConnectionCredentials = async (config: TDaytonaConnectionConfig) => {
  const { apiKey } = config.credentials;

  // Listing secrets is the capability every Daytona sync needs, so validating against it proves both
  // that the key works and that it carries manage:secrets. Reading the key's own details would not.
  try {
    await request.get(`${IntegrationUrls.DAYTONA_API_URL}/secret/paginated`, {
      params: { limit: 1 },
      headers: getDaytonaAuthHeaders(apiKey)
    });
  } catch (error: unknown) {
    logger.error({ error }, "Failed to validate Daytona connection");

    if (error instanceof AxiosError) {
      if (error.response?.status === 401) {
        throw new BadRequestError({
          message: "Unable to validate connection: the Daytona API key was rejected. Verify the key and try again."
        });
      }

      if (error.response?.status === 403) {
        throw new BadRequestError({
          message: `Unable to validate connection: the Daytona API key is missing the '${DAYTONA_MANAGE_SECRETS_PERMISSION}' permission. Grant it to the key in Daytona under Settings > API Keys.`
        });
      }

      throw new BadRequestError({
        message: `Unable to validate connection: Daytona returned ${
          error.response?.status ?? "no"
        } status. Verify the API key and try again.`
      });
    }

    throw new BadRequestError({
      message: "Unable to validate connection: could not reach Daytona. Verify the API key and try again."
    });
  }

  return config.credentials;
};
