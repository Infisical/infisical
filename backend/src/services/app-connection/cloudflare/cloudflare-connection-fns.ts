import { AxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { CloudflareConnectionMethod } from "./cloudflare-connection-enum";
import { TCloudflareConnectionConfig } from "./cloudflare-connection-types";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";

export const getCloudflareConnectionListItem = () => {
  return {
    name: "Cloudflare" as const,
    app: AppConnection.Cloudflare as const,
    methods: Object.values(CloudflareConnectionMethod) as [CloudflareConnectionMethod.APIToken]
  };
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

    if (resp.data.data === null) {
      throw new BadRequestError({
        message: "Unable to validate connection: Invalid API token provided."
      });
    }
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to validate credentials: ${error.response?.data?.errors?.[0]?.message || error.message || "Unknown error"}`
      });
    }
    throw new BadRequestError({
      message: "Unable to validate connection: verify credentials"
    });
  }

  return config.credentials;
};
