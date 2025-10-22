import { AxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { NorthflankConnectionMethod } from "./northflank-connection-enums";
import { TNorthflankConnection, TNorthflankConnectionConfig, TNorthflankProject } from "./northflank-connection-types";

const NORTHFLANK_API_URL = "https://api.northflank.com";

export const getNorthflankConnectionListItem = () => {
  return {
    name: "Northflank" as const,
    app: AppConnection.Northflank as const,
    methods: Object.values(NorthflankConnectionMethod)
  };
};

export const validateNorthflankConnectionCredentials = async (config: TNorthflankConnectionConfig) => {
  const { credentials } = config;

  try {
    await request.get(`${NORTHFLANK_API_URL}/v1/projects`, {
      headers: {
        Authorization: `Bearer ${credentials.apiToken}`,
        Accept: "application/json"
      }
    });
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to validate Northflank credentials: ${error.message || "Unknown error"}`
      });
    }

    throw new BadRequestError({
      message: `Failed to validate Northflank credentials - verify API token is correct`
    });
  }

  return credentials;
};

export const listProjects = async (appConnection: TNorthflankConnection): Promise<TNorthflankProject[]> => {
  const { credentials } = appConnection;

  try {
    const {
      data: {
        data: { projects }
      }
    } = await request.get<{ data: { projects: TNorthflankProject[] } }>(`${NORTHFLANK_API_URL}/v1/projects`, {
      headers: {
        Authorization: `Bearer ${credentials.apiToken}`,
        Accept: "application/json"
      }
    });

    return projects;
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to list Northflank projects: ${error.message || "Unknown error"}`
      });
    }

    throw new BadRequestError({
      message: "Unable to list Northflank projects",
      error
    });
  }
};
