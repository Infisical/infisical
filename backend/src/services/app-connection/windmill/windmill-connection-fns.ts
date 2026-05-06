import { AxiosError } from "axios";

import { BadRequestError } from "@app/lib/errors";
import { removeTrailingSlash } from "@app/lib/fn";
import { safeRequest } from "@app/lib/validator";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { WindmillConnectionMethod } from "./windmill-connection-enums";
import { TWindmillConnection, TWindmillConnectionConfig, TWindmillWorkspace } from "./windmill-connection-types";

export const getWindmillInstanceUrl = (config: TWindmillConnectionConfig) => {
  return config.credentials.instanceUrl
    ? removeTrailingSlash(config.credentials.instanceUrl)
    : "https://app.windmill.dev";
};

export const getWindmillConnectionListItem = () => {
  return {
    name: "Windmill" as const,
    app: AppConnection.Windmill as const,
    methods: Object.values(WindmillConnectionMethod) as [WindmillConnectionMethod.AccessToken]
  };
};

export const validateWindmillConnectionCredentials = async (config: TWindmillConnectionConfig) => {
  const instanceUrl = getWindmillInstanceUrl(config);
  const { accessToken } = config.credentials;

  try {
    await safeRequest.get(`${instanceUrl}/api/workspaces/list`, {
      headers: {
        Authorization: `Bearer ${accessToken}`
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

export const listWindmillWorkspaces = async (appConnection: TWindmillConnection) => {
  const instanceUrl = getWindmillInstanceUrl(appConnection);
  const { accessToken } = appConnection.credentials;

  const resp = await safeRequest.get<TWindmillWorkspace[]>(`${instanceUrl}/api/workspaces/list`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  return resp.data.filter((workspace) => !workspace.deleted);
};
