import { AxiosError } from "axios";

import { BadRequestError } from "@app/lib/errors";
import { removeTrailingSlash } from "@app/lib/fn";
import { safeRequest } from "@app/lib/validator";

import { AppConnection } from "../app-connection-enums";
import { RundeckConnectionMethod } from "./rundeck-connection-enums";
import { TRundeckConnection, TRundeckConnectionConfig, TRundeckProject } from "./rundeck-connection-types";

export const RUNDECK_API_VERSION = "58";

// URL validation and private-IP blocking happen at request time inside `safeRequest`, which
// also pins the connection to the validated IPs, preventing DNS rebinding between check and request.
export const getRundeckInstanceUrl = (config: TRundeckConnectionConfig) =>
  removeTrailingSlash(config.credentials.instanceUrl);

export const getRundeckConnectionListItem = () => {
  return {
    name: "Rundeck" as const,
    app: AppConnection.Rundeck as const,
    methods: Object.values(RundeckConnectionMethod) as [RundeckConnectionMethod.ApiToken]
  };
};

export const validateRundeckConnectionCredentials = async (config: TRundeckConnectionConfig) => {
  const instanceUrl = getRundeckInstanceUrl(config);
  const { apiToken } = config.credentials;

  try {
    await safeRequest.get(`${instanceUrl}/api/${RUNDECK_API_VERSION}/projects`, {
      headers: {
        "X-Rundeck-Auth-Token": apiToken,
        Accept: "application/json"
      }
    });
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to validate Rundeck credentials: ${error.message || "Unknown error"}`
      });
    }

    if (error instanceof BadRequestError) {
      throw error;
    }

    throw new BadRequestError({
      message: `Failed to validate Rundeck credentials - verify the instance URL and API token are correct`
    });
  }

  return config.credentials;
};

export const listRundeckProjects = async (appConnection: TRundeckConnection): Promise<TRundeckProject[]> => {
  const instanceUrl = getRundeckInstanceUrl(appConnection);
  const { apiToken } = appConnection.credentials;

  try {
    const { data } = await safeRequest.get<TRundeckProject[]>(`${instanceUrl}/api/${RUNDECK_API_VERSION}/projects`, {
      headers: {
        "X-Rundeck-Auth-Token": apiToken,
        Accept: "application/json"
      }
    });

    return data.map((project) => ({ name: project.name }));
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to list Rundeck projects: ${error.message || "Unknown error"}`
      });
    }

    if (error instanceof BadRequestError) {
      throw error;
    }

    throw new BadRequestError({
      message: "Unable to list Rundeck projects",
      error
    });
  }
};
