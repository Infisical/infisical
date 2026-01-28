/* eslint-disable no-await-in-loop */
import axios, { AxiosError } from "axios";

import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { DbtConnectionMethod } from "./dbt-connection-constants";
import { TDbtConnectionConfig, TDbtErrorResponse, TDbtListProjectsResponse } from "./dbt-connection-types";

export const getDbtConnectionListItem = () => {
  return {
    name: "DBT" as const,
    app: AppConnection.Dbt as const,
    methods: Object.values(DbtConnectionMethod)
  };
};

export const getDbtUrl = async (config: {
  credentials: Pick<TDbtConnectionConfig["credentials"], "instanceUrl">;
}): Promise<string> => {
  let hostname: string;
  try {
    const urlString = config.credentials.instanceUrl.includes("://")
      ? config.credentials.instanceUrl
      : `https://${config.credentials.instanceUrl}`;
    const url = new URL(urlString);
    hostname = url.hostname;
  } catch {
    throw new BadRequestError({ message: `Invalid DBT instance URL: ${config.credentials.instanceUrl}` });
  }

  const baseUrl = `https://${hostname}`;
  await blockLocalAndPrivateIpAddresses(baseUrl);

  return baseUrl;
};

export const createDbtError = (error: AxiosError) => {
  if (error.response?.data) {
    const response = error.response.data as TDbtErrorResponse;
    if (response?.status?.is_success) {
      return null;
    }

    return response?.data?.reason || response?.status?.user_message || response?.status?.developer_message || null;
  }
};

const retrieveDbtAccount = async (config: TDbtConnectionConfig) => {
  const { credentials } = config;

  const dbtUrl = await getDbtUrl(config);

  await axios.get(`${dbtUrl}/api/v2/accounts/${credentials.accountId}/`, {
    headers: {
      Authorization: `Bearer ${credentials.apiToken}`
    }
  });
};

export const validateDbtConnectionCredentials = async (config: TDbtConnectionConfig) => {
  try {
    // there's no explicit way of checking a tokens permissions,
    // so we're just checking to see if we're able to retrieve the configured account using the configured api token
    await retrieveDbtAccount(config);
  } catch (error: unknown) {
    if (error instanceof BadRequestError) {
      throw error;
    }

    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to validate credentials: ${error.message || "Unknown error"}`
      });
    }

    throw new BadRequestError({
      message: "Unable to validate connection - verify credentials"
    });
  }

  return config.credentials;
};

export const listDbtProjects = async (config: TDbtConnectionConfig) => {
  try {
    const { credentials } = config;

    const dbtUrl = await getDbtUrl(config);

    const res = await axios.get<TDbtListProjectsResponse>(
      `${dbtUrl}/api/v3/accounts/${credentials.accountId}/projects`,
      {
        headers: {
          Authorization: `Bearer ${credentials.apiToken}`
        }
      }
    );

    return res.data.data.map((project) => ({
      id: project.id,
      name: project.name,
      description: project.description || "",
      createdAt: project.created_at,
      updatedAt: project.updated_at
    }));
  } catch (error: unknown) {
    if (error instanceof BadRequestError) {
      throw error;
    }

    logger.error(error, "Failed to list DBT projects");

    if (error instanceof AxiosError) {
      const errorMessage = createDbtError(error);
      if (errorMessage) {
        throw new BadRequestError({
          message: `Failed to list projects: ${errorMessage}`
        });
      }

      throw new BadRequestError({
        message: `Failed to list projects: ${error.message || "Unknown error"}`
      });
    }

    throw new BadRequestError({
      message: "Unable to list projects"
    });
  }
};
