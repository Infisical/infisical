import { AxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { removeTrailingSlash } from "@app/lib/fn";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { WindmillConnectionMethod } from "./windmill-connection-enums";
import { TWindmillConnection, TWindmillConnectionConfig, TWindmillWorkspace } from "./windmill-connection-types";

export const getWindmillInstanceUrl = async (config: TWindmillConnectionConfig) => {
  const instanceUrl = config.credentials.instanceUrl
    ? removeTrailingSlash(config.credentials.instanceUrl)
    : "https://app.windmill.dev";

  await blockLocalAndPrivateIpAddresses(instanceUrl);

  return instanceUrl;
};

export const getWindmillConnectionListItem = () => {
  return {
    name: "Windmill" as const,
    app: AppConnection.Windmill as const,
    methods: Object.values(WindmillConnectionMethod) as [WindmillConnectionMethod.AccessToken]
  };
};

export const validateWindmillConnectionCredentials = async (config: TWindmillConnectionConfig) => {
  const instanceUrl = await getWindmillInstanceUrl(config);
  const { accessToken } = config.credentials;

  try {
    await request.get(`${instanceUrl}/api/workspaces/list`, {
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
  const instanceUrl = await getWindmillInstanceUrl(appConnection);
  const { accessToken } = appConnection.credentials;

  const resp = await request.get<TWindmillWorkspace[]>(`${instanceUrl}/api/workspaces/list`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  return resp.data.filter((workspace) => !workspace.deleted);
};
