import { request } from "@app/lib/config/request";
import { UnauthorizedError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { ConvexConnectionMethod } from "./convex-connection-enums";
import { TConvexConnectionConfig } from "./convex-connection-types";

export const CONVEX_API_BASE_URL = "https://api.convex.dev";

export const getConvexConnectionListItem = () => {
  return {
    name: "Convex" as const,
    app: AppConnection.Convex as const,
    methods: Object.values(ConvexConnectionMethod) as [ConvexConnectionMethod.PersonalAccessToken]
  };
};

export const validateConvexConnectionCredentials = async (config: TConvexConnectionConfig) => {
  const { accessToken, instanceUrl } = config.credentials;
  const baseUrl = instanceUrl || CONVEX_API_BASE_URL;

  await blockLocalAndPrivateIpAddresses(baseUrl);

  try {
    await request.get(`${baseUrl}/v1/list_personal_access_tokens`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      validateStatus: (status) => status === 200
    });
  } catch (e) {
    logger.error({ error: e instanceof Error ? e.message : "Unknown error" }, "failed to connect");
    throw new UnauthorizedError({
      message: "Unable to validate connection: verify that your access token and instance URL are correct"
    });
  }

  return config.credentials;
};
