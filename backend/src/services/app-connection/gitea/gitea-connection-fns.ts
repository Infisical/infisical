import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { removeTrailingSlash } from "@app/lib/fn";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";

import { AppConnection } from "../app-connection-enums";
import { GiteaConnectionMethod } from "./gitea-connection-enums";
import { TGiteaConnectionConfig } from "./gitea-connection-types";

export const getGiteaConnectionListItem = () => {
  return {
    name: "Gitea" as const,
    app: AppConnection.Gitea as const,
    methods: Object.values(GiteaConnectionMethod) as [GiteaConnectionMethod.PersonalAccessToken]
  };
};

export const getGiteaInstanceUrl = async (config: Pick<TGiteaConnectionConfig, "credentials">) => {
  const instanceUrl = removeTrailingSlash(config.credentials.instanceUrl);

  await blockLocalAndPrivateIpAddresses(instanceUrl);

  return instanceUrl;
};

export const validateGiteaConnectionCredentials = async (config: TGiteaConnectionConfig) => {
  const instanceUrl = await getGiteaInstanceUrl(config);
  const { personalAccessToken } = config.credentials;

  try {
    await request.get(`${instanceUrl}/api/v1/user`, {
      headers: {
        Authorization: `Bearer ${personalAccessToken}`,
        Accept: "application/json"
      }
    });
  } catch (error: unknown) {
    throw new BadRequestError({
      message: `Failed to validate credentials: ${(error as Error)?.message || "verify credentials"}`
    });
  }

  return config.credentials;
};
