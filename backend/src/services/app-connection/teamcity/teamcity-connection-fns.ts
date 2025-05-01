import { AxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { removeTrailingSlash } from "@app/lib/fn";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { TeamCityConnectionMethod } from "./teamcity-connection-enums";
import {
  TTeamCityConnection,
  TTeamCityConnectionConfig,
  TTeamCityListProjectsResponse
} from "./teamcity-connection-types";

export const getTeamCityInstanceUrl = async (config: TTeamCityConnectionConfig) => {
  const instanceUrl = removeTrailingSlash(config.credentials.instanceUrl);

  await blockLocalAndPrivateIpAddresses(instanceUrl);

  return instanceUrl;
};

export const getTeamCityConnectionListItem = () => {
  return {
    name: "TeamCity" as const,
    app: AppConnection.TeamCity as const,
    methods: Object.values(TeamCityConnectionMethod) as [TeamCityConnectionMethod.AccessToken]
  };
};

export const validateTeamCityConnectionCredentials = async (config: TTeamCityConnectionConfig) => {
  const instanceUrl = await getTeamCityInstanceUrl(config);

  const { accessToken } = config.credentials;

  try {
    await request.get(`${instanceUrl}/app/rest/server`, {
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
  const instanceUrl = await getTeamCityInstanceUrl(appConnection);
  const { accessToken } = appConnection.credentials;

  const resp = await request.get<TTeamCityListProjectsResponse>(
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
