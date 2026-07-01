import { AxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { removeTrailingSlash } from "@app/lib/fn";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";

import { AppConnection } from "../app-connection-enums";
import { RundeckConnectionMethod } from "./rundeck-connection-enums";
import { TRundeckConnection, TRundeckConnectionConfig, TRundeckProject } from "./rundeck-connection-types";

export const getRundeckInstanceUrl = async (config: TRundeckConnectionConfig) => {
  const instanceUrl = removeTrailingSlash(config.credentials.instanceUrl);

  await blockLocalAndPrivateIpAddresses(instanceUrl);

  return instanceUrl;
};

export const getRundeckConnectionListItem = () => {
  return {
    name: "Rundeck" as const,
    app: AppConnection.Rundeck as const,
    methods: Object.values(RundeckConnectionMethod) as [RundeckConnectionMethod.ApiToken]
  };
};

export const validateRundeckConnectionCredentials = async (config: TRundeckConnectionConfig) => {
  const instanceUrl = await getRundeckInstanceUrl(config);
  const { apiToken } = config.credentials;

  try {
    await request.get(`${instanceUrl}/api/14/projects`, {
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

    throw new BadRequestError({
      message: `Failed to validate Rundeck credentials - verify the instance URL and API token are correct`
    });
  }

  return config.credentials;
};

export const listRundeckProjects = async (appConnection: TRundeckConnection): Promise<TRundeckProject[]> => {
  const instanceUrl = await getRundeckInstanceUrl(appConnection);
  const { apiToken } = appConnection.credentials;

  try {
    const { data } = await request.get<TRundeckProject[]>(`${instanceUrl}/api/14/projects`, {
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
