/* eslint-disable no-await-in-loop */
import { AxiosError } from "axios";

import { BadRequestError } from "@app/lib/errors";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { ChecklyConnectionMethod } from "./checkly-connection-constants";
import { ChecklyPublicAPI } from "./checkly-connection-public-client";
import { TChecklyConnectionConfig } from "./checkly-connection-types";

export const getChecklyConnectionListItem = () => {
  return {
    name: "Checkly" as const,
    app: AppConnection.Checkly as const,
    methods: Object.values(ChecklyConnectionMethod)
  };
};

export const validateChecklyConnectionCredentials = async (config: TChecklyConnectionConfig) => {
  try {
    await ChecklyPublicAPI.healthcheck(config);
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to validate credentials: ${error.message || "Unknown error"}`
      });
    }

    throw new BadRequestError({
      message: "Unable to validate connection - verify credentials"
    });
  }

  return config.credentials;
};
