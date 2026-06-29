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
    // Hasura Cloud's GraphQL API returns HTTP 200 even on auth failures, so we must
    // inspect the response body rather than relying on the status code alone.
    const { data } = await request.post<{
      data?: { projects?: unknown[] };
      errors?: { message: string }[];
    }>(
      HASURA_CLOUD_API_URL,
      { query: "query { projects { name tenant { id } } }" },
      {
        headers: {
          Authorization: `pat ${accessToken}`,
          "Content-Type": "application/json"
        }
      }
    );

    if (data.errors?.length || !data.data?.projects) {
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
    const { data } = await request.post<{
      data?: { projects?: { id: string; name: string; tenant: { id: string } | null }[] };
      errors?: { message: string }[];
    }>(
      HASURA_CLOUD_API_URL,
      { query: "query listProjects { projects { id name tenant { id } } }" },
      {
        headers: {
          Authorization: `pat ${accessToken}`,
          "Content-Type": "application/json"
        }
      }
    );

    if (data.errors?.length || !data.data?.projects) {
      throw new BadRequestError({
        message: "Failed to list projects: invalid response from Hasura Cloud"
      });
    }

    return data.data.projects.map((project) => ({
      id: project.id,
      name: project.name,
      tenants: project.tenant ? [{ id: project.tenant.id }] : []
    }));
  } catch (error) {
    if (error instanceof BadRequestError) throw error;

    throw new BadRequestError({
      message: "Unable to list projects from Hasura Cloud"
    });
  }
};
