/* eslint-disable no-await-in-loop */
import { AxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { OnaConnectionMethod } from "./ona-connection-enums";
import { TOnaConnection, TOnaConnectionConfig, TOnaProject, TOnaProjectListResponse } from "./ona-connection-types";

const GET_AUTHENTICATED_IDENTITY_PATH = "/gitpod.v1.IdentityService/GetAuthenticatedIdentity";
const ONA_LIST_PROJECTS_PATH = "/gitpod.v1.ProjectService/ListProjects";
const ONA_API_URL = "https://app.gitpod.io/api";
const ONA_PAGE_SIZE = 100;

export const getOnaConnectionListItem = () => {
  return {
    name: "Ona" as const,
    app: AppConnection.Ona as const,
    methods: Object.values(OnaConnectionMethod) as [OnaConnectionMethod.PersonalAccessToken]
  };
};

export const validateOnaConnectionCredentials = async (config: TOnaConnectionConfig) => {
  const { credentials: inputCredentials } = config;

  try {
    await request.post(
      `${ONA_API_URL}${GET_AUTHENTICATED_IDENTITY_PATH}`,
      {},
      {
        headers: {
          Authorization: `Bearer ${inputCredentials.personalAccessToken}`,
          "Content-Type": "application/json"
        }
      }
    );
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to validate credentials: ${
          error.response?.data ? JSON.stringify(error.response?.data) : error.message || "Unknown error"
        }`
      });
    }
    throw new BadRequestError({
      message: `Unable to validate connection: ${(error as Error).message || "Verify credentials"}`
    });
  }

  return inputCredentials;
};

export const listOnaProjects = async (appConnection: TOnaConnection): Promise<TOnaProject[]> => {
  const { personalAccessToken } = appConnection.credentials;

  const allProjects: TOnaProject[] = [];
  let token: string | undefined;
  let hasMoreProjects = true;

  try {
    while (hasMoreProjects) {
      const body: { pagination: { pageSize: number; token?: string } } = {
        pagination: { pageSize: ONA_PAGE_SIZE, ...(token ? { token } : {}) }
      };

      const { data } = await request.post<TOnaProjectListResponse>(`${ONA_API_URL}${ONA_LIST_PROJECTS_PATH}`, body, {
        headers: {
          Authorization: `Bearer ${personalAccessToken}`,
          "Content-Type": "application/json"
        }
      });

      if (data?.projects?.length) {
        allProjects.push(
          ...data.projects.map((project) => ({
            id: project.id,
            name: project.metadata?.name || ""
          }))
        );
      }

      token = data?.pagination?.nextToken || undefined;
      hasMoreProjects = Boolean(token);
    }
  } catch (error) {
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to fetch Ona projects: ${
          error.response?.data ? JSON.stringify(error.response?.data) : error.message || "Unknown error"
        }`
      });
    }
    throw error;
  }

  logger.info({ allProjects }, "Ona projects fetched successfully");

  return allProjects;
};
