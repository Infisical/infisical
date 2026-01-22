import { AxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { CircleCIConnectionMethod } from "./circleci-connection-enums";
import { TCircleCIConnectionConfig } from "./circleci-connection-types";

export const CIRCLECI_API_URL = "https://circleci.com/api/v2";

export const getCircleCIConnectionListItem = () => {
  return {
    name: "CircleCI" as const,
    app: AppConnection.CircleCI as const,
    methods: Object.values(CircleCIConnectionMethod) as [CircleCIConnectionMethod.PersonalAccessToken]
  };
};

export const validateCircleCIConnectionCredentials = async (config: TCircleCIConnectionConfig) => {
  const { credentials: inputCredentials } = config;

  try {
    // Validate the API token by calling the /me endpoint
    await request.get(`${CIRCLECI_API_URL}/me`, {
      headers: {
        "Circle-Token": inputCredentials.apiToken
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

  return inputCredentials;
};
