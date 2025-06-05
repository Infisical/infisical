import { request } from "@app/lib/config/request";
import { removeTrailingSlash } from "@app/lib/fn";
import { AppConnection } from "../app-connection-enums";
import { CoolifyConnectionMethod } from "./coolify-connection-enums";
import { TCoolifyConnectionConfig } from "./coolify-connection-types";
import { AxiosError } from "axios";
import { BadRequestError } from "@app/lib/errors";

export const getCoolifyInstanceUrl = (config: TCoolifyConnectionConfig) => {
  return removeTrailingSlash(config.credentials.instanceUrl);
};

export const getCoolifyConnectionListItem = () => {
  return {
    name: "Coolify" as const,
    app: AppConnection.Coolify as const,
    methods: Object.values(CoolifyConnectionMethod) as [CoolifyConnectionMethod.ApiToken]
  };
};

export const validateCoolifyConnectionCredentials = async (config: TCoolifyConnectionConfig) => {
  const instanceUrl = getCoolifyInstanceUrl(config);
  const { apiToken } = config.credentials;

  try {
    await request.get(`${instanceUrl}/api/v1/servers`, {
      headers: {
        Authorization: `Bearer ${apiToken}`,
        Accept: "application/json"
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

  return config.credentials;
};
