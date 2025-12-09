import { AxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";

import { AppConnection } from "../app-connection-enums";
import { OctopusDeployConnectionMethod } from "./octopus-deploy-connection-enums";
import {
  TOctopusDeployConnection,
  TOctopusDeployConnectionConfig,
  TOctopusDeployProject,
  TOctopusDeployProjectResponse,
  TOctopusDeployScopeValues,
  TOctopusDeployScopeValuesResponse,
  TOctopusDeploySpace,
  TOctopusDeploySpaceResponse
} from "./octopus-deploy-connection-types";

export const getOctopusDeployConnectionListItem = () => {
  return {
    name: "Octopus Deploy" as const,
    app: AppConnection.OctopusDeploy as const,
    methods: Object.values(OctopusDeployConnectionMethod) as [OctopusDeployConnectionMethod.ApiKey]
  };
};

export const validateOctopusDeployConnectionCredentials = async (config: TOctopusDeployConnectionConfig) => {
  const { credentials: inputCredentials } = config;
  try {
    await request.get(`${inputCredentials.instanceUrl}/api/users/me`, {
      headers: {
        "X-Octopus-ApiKey": inputCredentials.apiKey,
        "X-NuGet-ApiKey": inputCredentials.apiKey,
        Accept: "application/json"
      }
    });
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to validate Octopus Deploy credentials: ${error.message || "Unknown error"}`
      });
    }

    throw new BadRequestError({
      message: `Failed to validate Octopus Deploy credentials - verify API key is correct`
    });
  }

  return inputCredentials;
};

export const getOctopusDeploySpaces = async (
  appConnection: TOctopusDeployConnection
): Promise<TOctopusDeploySpace[]> => {
  const { credentials } = appConnection;
  const { instanceUrl, apiKey } = credentials;

  try {
    const { data } = await request.get<TOctopusDeploySpaceResponse[]>(`${instanceUrl}/api/spaces/all`, {
      headers: {
        "X-Octopus-ApiKey": apiKey,
        "X-NuGet-ApiKey": apiKey,
        Accept: "application/json"
      }
    });

    return data.map((space) => ({
      id: space.Id,
      name: space.Name,
      slug: space.Slug,
      isDefault: space.IsDefault
    }));
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to list Octopus Deploy spaces: ${error.message || "Unknown error"}`
      });
    }

    throw new BadRequestError({
      message: "Unable to list Octopus Deploy spaces",
      error
    });
  }
};

export const getOctopusDeployProjects = async (
  appConnection: TOctopusDeployConnection,
  spaceId: string
): Promise<TOctopusDeployProject[]> => {
  const { credentials } = appConnection;
  const { instanceUrl, apiKey } = credentials;

  try {
    const { data } = await request.get<TOctopusDeployProjectResponse[]>(`${instanceUrl}/api/${spaceId}/projects/all`, {
      headers: {
        "X-Octopus-ApiKey": apiKey,
        "X-NuGet-ApiKey": apiKey,
        Accept: "application/json"
      }
    });

    return data.map((project) => ({
      id: project.Id,
      name: project.Name,
      slug: project.Slug
    }));
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to list Octopus Deploy projects: ${error.message || "Unknown error"}`
      });
    }

    throw new BadRequestError({
      message: "Unable to list Octopus Deploy projects",
      error
    });
  }
};

export const getOctopusDeployScopeValues = async (
  appConnection: TOctopusDeployConnection,
  spaceId: string,
  projectId: string
): Promise<TOctopusDeployScopeValues> => {
  const { credentials } = appConnection;
  const { instanceUrl, apiKey } = credentials;

  try {
    const { data } = await request.get<TOctopusDeployScopeValuesResponse>(
      `${instanceUrl}/api/${spaceId}/projects/${projectId}/variables`,
      {
        headers: {
          "X-Octopus-ApiKey": apiKey,
          "X-NuGet-ApiKey": apiKey,
          Accept: "application/json"
        }
      }
    );

    const { ScopeValues } = data;

    const scopeValues: TOctopusDeployScopeValues = {
      environments: ScopeValues.Environments.map((environment) => ({
        id: environment.Id,
        name: environment.Name
      })),
      tenantTags: ScopeValues.TenantTags.map((tenantTag) => ({
        id: tenantTag.Id,
        name: tenantTag.Name
      })),
      machines: ScopeValues.Machines.map((machine) => ({
        id: machine.Id,
        name: machine.Name
      })),
      processes: ScopeValues.Processes.map((process) => ({
        id: process.Id,
        name: process.Name
      })),
      actions: ScopeValues.Actions.map((action) => ({
        id: action.Id,
        name: action.Name
      })),
      channels: ScopeValues.Channels.map((channel) => ({
        id: channel.Id,
        name: channel.Name
      }))
    };

    return scopeValues;
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to get Octopus Deploy scope values: ${error.message || "Unknown error"}`
      });
    }

    throw new BadRequestError({
      message: "Unable to get Octopus Deploy scope values",
      error
    });
  }
};
