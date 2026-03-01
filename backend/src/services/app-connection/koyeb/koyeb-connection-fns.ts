import { AxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";

import { AppConnection } from "../app-connection-enums";
import { KoyebConnectionMethod } from "./koyeb-connection-enums";
import { TKoyebConnectionConfig } from "./koyeb-connection-types";

export const getKoyebConnectionListItem = () => {
  return {
    name: "Koyeb" as const,
    app: AppConnection.Koyeb as const,
    methods: Object.values(KoyebConnectionMethod) as [KoyebConnectionMethod.ApiKey]
  };
};

export const validateKoyebConnectionCredentials = async (config: TKoyebConnectionConfig) => {
  const { credentials: inputCredentials } = config;

  try {
    await request.get(`${IntegrationUrls.KOYEB_API_URL}/apps`, {
      headers: {
        Authorization: `Bearer ${inputCredentials.apiKey}`
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

  return inputCredentials;
};
