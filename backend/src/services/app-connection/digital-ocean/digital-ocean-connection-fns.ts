/* eslint-disable no-await-in-loop */
import { AxiosError } from "axios";
import { z } from "zod";

import { BadRequestError } from "@app/lib/errors";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { DigitalOceanConnectionMethod } from "./digital-ocean-connection-constants";
import { DigitalOceanAppPlatformPublicAPI } from "./digital-ocean-connection-public-client";
import { DigitalOceanConnectionListItemSchema } from "./digital-ocean-connection-schemas";
import { TDigitalOceanConnectionConfig } from "./digital-ocean-connection-types";

export const getDigitalOceanConnectionListItem = () => {
  return {
    name: "Digital Ocean" as z.infer<typeof DigitalOceanConnectionListItemSchema>["name"],
    app: AppConnection.DigitalOcean as const,
    methods: Object.values(DigitalOceanConnectionMethod)
  };
};

export const validateDigitalOceanConnectionCredentials = async (config: TDigitalOceanConnectionConfig) => {
  try {
    await DigitalOceanAppPlatformPublicAPI.healthcheck(config);
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
