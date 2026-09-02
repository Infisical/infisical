import { HttpStatusCode, isAxiosError } from "axios";

import { BadRequestError } from "@app/lib/errors";
import { safeRequest } from "@app/lib/validator/safe-request";
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
    await safeRequest.get(`${IntegrationUrls.DAYTONA_API_URL}/secret/paginated`, {
      params: { limit: 1 },
      headers: getDaytonaAuthHeaders(apiKey)
    });
  } catch (error: unknown) {
    // The raw Axios error is deliberately not logged: it carries the API key at
    // config.headers.Authorization, which sits past the logger's depth-3 redaction and under a key
    // name the redaction list does not cover.
    if (isAxiosError(error)) {
      if (error.response?.status === HttpStatusCode.Unauthorized) {
        throw new BadRequestError({
          message: "Unable to validate connection: the Daytona API key was rejected. Verify the key and try again."
        });
      }

      if (error.response?.status === HttpStatusCode.Forbidden) {
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
