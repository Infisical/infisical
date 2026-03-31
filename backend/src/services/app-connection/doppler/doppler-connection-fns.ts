import { AxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";

import { AppConnection } from "../app-connection-enums";
import { DopplerConnectionMethod } from "./doppler-connection-enums";
import {
  TDopplerConnection,
  TDopplerConnectionConfig,
  TDopplerEnvironment,
  TDopplerProject,
  TDopplerSecret
} from "./doppler-connection-types";

const DOPPLER_API_URL = "https://api.doppler.com";

export const getDopplerConnectionListItem = () => {
  return {
    name: "Doppler" as const,
    app: AppConnection.Doppler as const,
    methods: Object.values(DopplerConnectionMethod) as [DopplerConnectionMethod.ApiToken]
  };
};

export const validateDopplerConnectionCredentials = async (config: TDopplerConnectionConfig) => {
  const { credentials: inputCredentials } = config;

  try {
    await request.get(`${DOPPLER_API_URL}/v3/me`, {
      headers: {
        Authorization: `Bearer ${inputCredentials.apiToken}`
      }
    });
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to validate Doppler credentials: ${error.response?.data?.messages?.join(", ") || error.message || "Unknown error"}`
      });
    }
    throw new BadRequestError({
      message: "Unable to validate Doppler connection: verify credentials"
    });
  }

  return inputCredentials;
};

export const listDopplerProjects = async (appConnection: TDopplerConnection): Promise<TDopplerProject[]> => {
  const {
    credentials: { apiToken }
  } = appConnection;

  const projects: TDopplerProject[] = [];
  let page = 1;
  const perPage = 50;
  const maxPages = 20;
  let hasMore = true;

  while (hasMore && page <= maxPages) {
    const res = await request.get<{ projects: TDopplerProject[]; page: number }>(`${DOPPLER_API_URL}/v3/projects`, {
      params: { page, per_page: perPage },
      headers: { Authorization: `Bearer ${apiToken}` }
    });

    projects.push(...res.data.projects);

    if (res.data.projects.length < perPage) {
      hasMore = false;
    } else {
      page += 1;
    }
  }

  return projects;
};

export const listDopplerEnvironments = async (
  appConnection: TDopplerConnection,
  projectSlug: string
): Promise<TDopplerEnvironment[]> => {
  const {
    credentials: { apiToken }
  } = appConnection;

  const environments: TDopplerEnvironment[] = [];
  let page = 1;
  const perPage = 50;
  const maxPages = 20;
  let hasMore = true;

  while (hasMore && page <= maxPages) {
    const res = await request.get<{ environments: TDopplerEnvironment[] }>(`${DOPPLER_API_URL}/v3/environments`, {
      params: { project: projectSlug, page, per_page: perPage },
      headers: { Authorization: `Bearer ${apiToken}` }
    });

    environments.push(...res.data.environments);

    if (res.data.environments.length < perPage) {
      hasMore = false;
    } else {
      page += 1;
    }
  }

  return environments;
};

export const getDopplerSecrets = async (
  appConnection: TDopplerConnection,
  projectSlug: string,
  environmentSlug: string
): Promise<Record<string, string>> => {
  const {
    credentials: { apiToken }
  } = appConnection;

  const res = await request.get<{ secrets: Record<string, TDopplerSecret> }>(
    `${DOPPLER_API_URL}/v3/configs/config/secrets`,
    {
      params: {
        project: projectSlug,
        config: environmentSlug,
        include_dynamic_secrets: false,
        include_managed_secrets: false
      },
      headers: { Authorization: `Bearer ${apiToken}` }
    }
  );

  return Object.fromEntries(
    Object.entries(res.data.secrets)
      .filter(([, v]) => v.raw !== null)
      .map(([k, v]) => [k, v.raw as string])
  );
};
