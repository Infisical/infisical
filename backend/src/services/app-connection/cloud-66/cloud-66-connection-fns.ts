import { request } from "@app/lib/config/request";
import { UnauthorizedError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { Cloud66ConnectionMethod } from "./cloud-66-connection-enums";
import { TCloud66ConnectionConfig } from "./cloud-66-connection-types";

export const CLOUD_66_API_BASE_URL = "https://app.cloud66.com/api";

export const getCloud66ConnectionListItem = () => {
  return {
    name: "Cloud 66" as const,
    app: AppConnection.Cloud66 as const,
    methods: Object.values(Cloud66ConnectionMethod) as [Cloud66ConnectionMethod.AccessToken]
  };
};

export const validateCloud66ConnectionCredentials = async (config: TCloud66ConnectionConfig) => {
  const { accessToken } = config.credentials;

  try {
    await request.get(`${CLOUD_66_API_BASE_URL}/3/stacks`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json"
      },
      validateStatus: (status) => status === 200
    });
  } catch (error: unknown) {
    logger.error({ error }, "failed to validate cloud 66 connection");

    throw new UnauthorizedError({
      message: "Unable to validate connection: invalid Personal Access Token"
    });
  }

  return config.credentials;
};
