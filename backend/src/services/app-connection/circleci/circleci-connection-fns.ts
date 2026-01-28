import { AxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { CircleCIConnectionMethod } from "./circleci-connection-enums";
import {
  TCircleCIConnection,
  TCircleCIConnectionConfig,
  TCircleCIOrganization,
  TCircleCIProject
} from "./circleci-connection-types";

type TCircleCICollaboration = {
  id?: string;
  name?: string;
  slug?: string;
  vcs_type?: string;
};

type TCircleCIProjectV1Response = {
  reponame: string;
  username: string;
  vcs_url: string;
};

export const getCircleCIApiUrl = async (config: {
  credentials: Pick<TCircleCIConnectionConfig["credentials"], "host">;
}) => {
  const rawHost = config.credentials.host?.trim() || "circleci.com";

  let hostname: string;
  try {
    // add protocol if missing to make it parseable
    const urlString = rawHost.includes("://") ? rawHost : `https://${rawHost}`;
    const url = new URL(urlString);
    hostname = url.hostname;
  } catch {
    throw new BadRequestError({ message: `Invalid CircleCI host: ${rawHost}` });
  }

  const baseUrl = `https://${hostname}`;
  await blockLocalAndPrivateIpAddresses(baseUrl);

  const apiUrl = `${baseUrl}/api`;

  console.log("apiUrl", apiUrl);
  return apiUrl;
};

export const getCircleCIConnectionListItem = () => {
  return {
    name: "CircleCI" as const,
    app: AppConnection.CircleCI as const,
    methods: Object.values(CircleCIConnectionMethod) as [CircleCIConnectionMethod.ApiToken]
  };
};

export const validateCircleCIConnectionCredentials = async (config: TCircleCIConnectionConfig) => {
  const { credentials } = config;

  try {
    const apiUrl = await getCircleCIApiUrl(config);

    // Validate the API token by calling the /me endpoint
    await request.get(`${apiUrl}/v2/me`, {
      headers: {
        "Circle-Token": credentials.apiToken
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

  return credentials;
};

export const listCircleCIOrganizations = async (
  appConnection: TCircleCIConnection
): Promise<TCircleCIOrganization[]> => {
  const { credentials } = appConnection;
  const { apiToken } = credentials;

  try {
    const apiUrl = await getCircleCIApiUrl(appConnection);

    // Fetch organizations the user has access to (same as legacy integration)
    const { data: collaborations } = await request.get<TCircleCICollaboration[]>(`${apiUrl}/v2/me/collaborations`, {
      headers: {
        "Circle-Token": apiToken,
        "Accept-Encoding": "application/json"
      }
    });

    // Fetch all followed projects using the v1.1 API (same as legacy integration)
    const { data: allProjects } = await request.get<TCircleCIProjectV1Response[]>(`${apiUrl}/v1.1/projects`, {
      headers: {
        "Circle-Token": apiToken,
        "Accept-Encoding": "application/json"
      }
    });

    // Group projects by organization (username field maps to org name)
    const projectsByOrg = new Map<string, TCircleCIProject[]>();
    for (const project of allProjects) {
      const orgName = project.username;
      if (!projectsByOrg.has(orgName)) {
        projectsByOrg.set(orgName, []);
      }

      projectsByOrg.get(orgName)!.push({
        name: project.reponame,
        id: project.vcs_url.split("/").pop()!
      });
    }

    const organizations = collaborations
      .filter((org): org is TCircleCICollaboration & { name: string } => Boolean(org.name))
      .map((org) => ({
        name: org.name,
        projects: projectsByOrg.get(org.name) ?? []
      }));

    return organizations;
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to fetch CircleCI organizations: ${error.message || "Unknown error"}`
      });
    }
    throw error;
  }
};
