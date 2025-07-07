/* eslint-disable no-await-in-loop */
import { AxiosError, AxiosResponse } from "axios";

import { request } from "@app/lib/config/request";
import { BadRequestError, InternalServerError } from "@app/lib/errors";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";

import { RailwayConnectionMethod, RailwayGraphQueries } from "./railway-connection-constants";
import {
  ProjectListGraphResponse,
  RailwayProject,
  TRailwayConnection,
  TRailwayConnectionConfig
} from "./railway-connection-types";

export const getRailwayConnectionListItem = () => {
  return {
    name: "Railway" as const,
    app: AppConnection.Railway as const,
    methods: Object.values(RailwayConnectionMethod) as [RailwayConnectionMethod.ApiToken]
  };
};

export const validateRailwayConnectionCredentials = async (config: TRailwayConnectionConfig) => {
  const { credentials: inputCredentials } = config;

  let response: AxiosResponse<ProjectListGraphResponse> | null = null;

  try {
    const data = {
      query: RailwayGraphQueries.listProjects,
      variables: {}
    };

    response = await request.post<ProjectListGraphResponse>(IntegrationUrls.RAILWAY_API_URL, data, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${inputCredentials.apiToken}`
      }
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

  if (!response?.data) {
    throw new InternalServerError({
      message: "Failed to get organizations: Response was empty"
    });
  }

  return inputCredentials;
};

export const listProjects = async (appConnection: TRailwayConnection): Promise<RailwayProject[]> => {
  const { credentials: inputCredentials } = appConnection;

  let response: AxiosResponse<ProjectListGraphResponse> | null = null;

  try {
    const data = {
      query: RailwayGraphQueries.listProjects,
      variables: {}
    };

    response = await request.post<ProjectListGraphResponse>(IntegrationUrls.RAILWAY_API_URL, data, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${inputCredentials.apiToken}`
      }
    });

    if (!response?.data || !response.data.data || !response.data.data.projects) {
      throw new BadRequestError({
        message: "Failed to get projects: Response was empty or malformed"
      });
    }

    return response.data.data.projects.edges.map((edge) => {
      const project = edge.node;

      return {
        id: project.id,
        name: project.name,
        environments: project.environments.edges.map((e) => ({
          id: e.node.id,
          name: e.node.name
        })),
        services: project.services.edges.map((s) => ({
          id: s.node.id,
          name: s.node.name
        }))
      } as RailwayProject;
    });
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to list projects: ${error.message || "Unknown error"}`
      });
    }

    throw new BadRequestError({
      message: "Unable to list projects - verify credentials"
    });
  }
};
