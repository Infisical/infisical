import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { HasuraCloudConnectionMethod } from "./hasura-cloud-connection-enums";
import {
  THasuraCloudConnection,
  THasuraCloudConnectionConfig,
  THasuraCloudProject
} from "./hasura-cloud-connection-types";

export const HASURA_CLOUD_API_URL = "https://data.pro.hasura.io/v1/graphql";

export const hasuraCloudGraphqlRequest = async <T = unknown>(
  accessToken: string,
  body: { query: string; variables?: Record<string, unknown> }
): Promise<T> => {
  const response = await request.post<T>(HASURA_CLOUD_API_URL, body, {
    headers: {
      Authorization: `pat ${accessToken}`,
      "Content-Type": "application/json"
    }
  });

  return response.data;
};

export const getHasuraCloudConnectionListItem = () => {
  return {
    name: "Hasura Cloud" as const,
    app: AppConnection.HasuraCloud as const,
    methods: Object.values(HasuraCloudConnectionMethod) as [HasuraCloudConnectionMethod.AccessToken]
  };
};

export const validateHasuraCloudConnectionCredentials = async (config: THasuraCloudConnectionConfig) => {
  const { accessToken } = config.credentials;

  try {
    const responseBody = await hasuraCloudGraphqlRequest<{
      data?: { projects?: unknown[] };
      errors?: { message: string }[];
    }>(accessToken, { query: "query { projects { name tenant { id } } }" });

    if (responseBody.errors?.length || !responseBody.data?.projects) {
      throw new BadRequestError({
        message: "Unable to validate connection: invalid access token"
      });
    }
  } catch (error) {
    if (error instanceof BadRequestError) throw error;

    throw new BadRequestError({
      message: "Unable to validate connection: invalid access token"
    });
  }

  return config.credentials;
};

export const listHasuraCloudProjects = async (
  appConnection: THasuraCloudConnection
): Promise<THasuraCloudProject[]> => {
  const { accessToken } = appConnection.credentials;

  try {
    const responseBody = await hasuraCloudGraphqlRequest<{
      data?: { projects?: { id: string; name: string; tenant: { id: string } }[] };
      errors?: { message: string }[];
    }>(accessToken, { query: "query listProjects { projects { id name tenant { id } } }" });

    if (responseBody.errors?.length || !responseBody.data?.projects) {
      throw new BadRequestError({
        message: "Failed to list projects: invalid response from Hasura Cloud"
      });
    }

    return responseBody.data.projects.map((project) => ({
      id: project.id,
      name: project.name,
      tenantId: project.tenant?.id ?? null
    }));
  } catch (error) {
    if (error instanceof BadRequestError) throw error;

    throw new BadRequestError({
      message: "Unable to list projects from Hasura Cloud"
    });
  }
};
