/* eslint-disable no-await-in-loop */
import { AxiosError } from "axios";

import { BadRequestError } from "@app/lib/errors";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { RailwayConnectionMethod } from "./railway-connection-constants";
import { RailwayPublicAPI } from "./railway-connection-public-client";
import { TRailwayConnection, TRailwayConnectionConfig } from "./railway-connection-types";

export const getRailwayConnectionListItem = () => {
  return {
    name: "Railway" as const,
    app: AppConnection.Railway as const,
    methods: Object.values(RailwayConnectionMethod)
  };
};

export const validateRailwayConnectionCredentials = async (config: TRailwayConnectionConfig) => {
  const { credentials, method } = config;

  try {
    await RailwayPublicAPI.healthcheck({
      method,
      credentials
    });
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

  return credentials;
};

export const listProjects = async (appConnection: TRailwayConnection) => {
  const { credentials, method } = appConnection;

  try {
    return await RailwayPublicAPI.listProjects({
      method,
      credentials
    });
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to list projects: ${error.message || "Unknown error"}`
      });
    }

    if (error instanceof BadRequestError) {
      throw error;
    }

    throw new BadRequestError({
      message: "Unable to list projects",
      error
    });
  }
};
