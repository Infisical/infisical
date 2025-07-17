import { AxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";

import { CloudflareConnectionMethod } from "./cloudflare-connection-enum";
import {
  TCloudflareConnection,
  TCloudflareConnectionConfig,
  TCloudflarePagesProject,
  TCloudflareWorkersScript
} from "./cloudflare-connection-types";

export const getCloudflareConnectionListItem = () => {
  return {
    name: "Cloudflare" as const,
    app: AppConnection.Cloudflare as const,
    methods: Object.values(CloudflareConnectionMethod) as [CloudflareConnectionMethod.APIToken]
  };
};

export const listCloudflarePagesProjects = async (
  appConnection: TCloudflareConnection
): Promise<TCloudflarePagesProject[]> => {
  const {
    credentials: { apiToken, accountId }
  } = appConnection;

  const { data } = await request.get<{ result: { name: string; id: string }[] }>(
    `${IntegrationUrls.CLOUDFLARE_API_URL}/client/v4/accounts/${accountId}/pages/projects`,
    {
      headers: {
        Authorization: `Bearer ${apiToken}`,
        Accept: "application/json"
      }
    }
  );

  return data.result.map((a) => ({
    name: a.name,
    id: a.id
  }));
};

export const listCloudflareWorkersScripts = async (
  appConnection: TCloudflareConnection
): Promise<TCloudflareWorkersScript[]> => {
  const {
    credentials: { apiToken, accountId }
  } = appConnection;

  const { data } = await request.get<{ result: { id: string }[] }>(
    `${IntegrationUrls.CLOUDFLARE_API_URL}/client/v4/accounts/${accountId}/workers/scripts`,
    {
      headers: {
        Authorization: `Bearer ${apiToken}`,
        Accept: "application/json"
      }
    }
  );

  return data.result.map((a) => ({
    id: a.id
  }));
};

export const validateCloudflareConnectionCredentials = async (config: TCloudflareConnectionConfig) => {
  const { apiToken, accountId } = config.credentials;

  try {
    const resp = await request.get(`${IntegrationUrls.CLOUDFLARE_API_URL}/client/v4/accounts/${accountId}`, {
      headers: {
        Authorization: `Bearer ${apiToken}`,
        Accept: "application/json"
      }
    });

    if (resp.data === null) {
      throw new BadRequestError({
        message: "Unable to validate connection: Invalid API token provided."
      });
    }
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        message: `Failed to validate credentials: ${error.response?.data?.errors?.[0]?.message || error.message || "Unknown error"}`
      });
    }
    throw new BadRequestError({
      message: "Unable to validate connection: verify credentials"
    });
  }

  return config.credentials;
};
