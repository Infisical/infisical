import { AxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";

import { FlyioConnectionMethod } from "./flyio-connection-enums";
import { TFlyioApp, TFlyioConnection, TFlyioConnectionConfig } from "./flyio-connection-types";

export const getFlyioConnectionListItem = () => {
  return {
    name: "Fly.io" as const,
    app: AppConnection.Flyio as const,
    methods: Object.values(FlyioConnectionMethod) as [FlyioConnectionMethod.AccessToken]
  };
};

export const validateFlyioConnectionCredentials = async (config: TFlyioConnectionConfig) => {
  const { accessToken } = config.credentials;

  try {
    const resp = await request.post<{ data: { viewer: { id: string | null; email: string } } | null }>(
      IntegrationUrls.FLYIO_API_URL,
      { query: "query { viewer { id email } }" },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        }
      }
    );

    if (resp.data.data === null) {
      throw new BadRequestError({
        message: "Unable to validate connection: Invalid access token provided."
      });
    }
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

export const listFlyioApps = async (appConnection: TFlyioConnection) => {
  const { accessToken } = appConnection.credentials;

  const resp = await request.post<{ data: { apps: { nodes: TFlyioApp[] } } }>(
    IntegrationUrls.FLYIO_API_URL,
    {
      query:
        "query GetApps { apps { nodes { id name hostname status organization { id slug } currentRelease { version status createdAt } } } }"
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json"
      }
    }
  );

  return resp.data.data.apps.nodes;
};
