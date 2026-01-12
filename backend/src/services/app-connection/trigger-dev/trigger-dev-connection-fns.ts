import { AxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { removeTrailingSlash } from "@app/lib/fn";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { TriggerDevConnectionMethod } from "./trigger-dev-connection-constants";
import { TTriggerDevConnectionConfig } from "./trigger-dev-connection-types";

export const getTriggerDevConnectionListItem = () => {
  return {
    name: "Trigger.dev" as const,
    app: AppConnection.TriggerDev as const,
    methods: Object.values(TriggerDevConnectionMethod)
  };
};

const DEFAULT_TRIGGER_DEV_API_URL = "https://api.trigger.dev";

const getNormalizedApiUrl = async (apiUrl?: string) => {
  const normalized = removeTrailingSlash(apiUrl || DEFAULT_TRIGGER_DEV_API_URL);
  await blockLocalAndPrivateIpAddresses(normalized);
  return normalized;
};

export const validateTriggerDevConnectionCredentials = async ({ credentials }: TTriggerDevConnectionConfig) => {
  const { apiToken, apiUrl } = credentials;

  try {
    const normalized = await getNormalizedApiUrl(apiUrl);
    await request.get(`${normalized}/api/v1/runs`, {
      headers: {
        Authorization: `Bearer ${apiToken}`,
        Accept: "application/json"
      }
    });
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      const responseData: unknown = error.response?.data;
      const details = responseData ? JSON.stringify(responseData) : error.message || "Unknown error";
      throw new BadRequestError({
        message: `Failed to validate credentials: ${details}`
      });
    }

    throw new BadRequestError({
      message: `Unable to validate connection: ${(error as Error).message || "Verify credentials"}`
    });
  }

  return credentials;
};
