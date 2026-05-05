import { AxiosError } from "axios";

import { BadRequestError } from "@app/lib/errors";
import { removeTrailingSlash } from "@app/lib/fn";
import { safeRequest } from "@app/lib/validator";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { TeamCityConnectionMethod } from "./teamcity-connection-enums";
import {
  TTeamCityConnection,
  TTeamCityConnectionConfig,
  TTeamCityListProjectsResponse
} from "./teamcity-connection-types";

export const getTeamCityInstanceUrl = (config: TTeamCityConnectionConfig) => {
  return removeTrailingSlash(config.credentials.instanceUrl);
};

export const getTeamCityConnectionListItem = () => {
  return {
    name: "TeamCity" as const,
    app: AppConnection.TeamCity as const,
    methods: Object.values(TeamCityConnectionMethod) as [TeamCityConnectionMethod.AccessToken]
  };
};

export const validateTeamCityConnectionCredentials = async (config: TTeamCityConnectionConfig) => {
  const instanceUrl = getTeamCityInstanceUrl(config);

  const { accessToken } = config.credentials;

  try {
    await safeRequest.get(`${instanceUrl}/app/rest/server`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json"
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

  return config.credentials;
};

export const listTeamCityProjects = async (appConnection: TTeamCityConnection) => {
  const instanceUrl = getTeamCityInstanceUrl(appConnection);
  const { accessToken } = appConnection.credentials;

  const resp = await safeRequest.get<TTeamCityListProjectsResponse>(
    `${instanceUrl}/app/rest/projects?fields=project(id,name,buildTypes(buildType(id,name)))`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json"
      }
    }
  );

  return resp.data.project;
};
