import { AxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";

import { AppConnection } from "../app-connection-enums";
import { RenderConnectionMethod } from "./render-connection-enums";
import { TRenderConnectionConfig } from "./render-connection-types";

export const getRenderConnectionListItem = () => {
  return {
    name: "Render" as const,
    app: AppConnection.Render as const,
    methods: Object.values(RenderConnectionMethod) as [RenderConnectionMethod.ApiKey]
  };
};

export const validateRenderConnectionCredentials = async (config: TRenderConnectionConfig) => {
  const { credentials: inputCredentials } = config;

  try {
    await request.get(`${IntegrationUrls.RENDER_API_URL}/v1/users`, {
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
