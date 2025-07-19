/* eslint-disable no-await-in-loop */
import { AxiosError } from "axios";

import { BadRequestError } from "@app/lib/errors";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { NetlifyConnectionMethod } from "./netlify-connection-constants";
import { NetlifyPublicAPI } from "./netlify-connection-public-client";
import { TNetlifyConnectionConfig } from "./netlify-connection-types";

export const getNetlifyConnectionListItem = () => {
  return {
    name: "Netlify" as const,
    app: AppConnection.Netlify as const,
    methods: Object.values(NetlifyConnectionMethod)
  };
};

export const validateNetlifyConnectionCredentials = async (config: TNetlifyConnectionConfig) => {
  try {
    await NetlifyPublicAPI.healthcheck(config);
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
