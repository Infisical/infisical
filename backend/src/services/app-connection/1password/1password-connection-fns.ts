import { AxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { removeTrailingSlash } from "@app/lib/fn";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { OnePassConnectionMethod } from "./1password-connection-enums";
import { TOnePassConnection, TOnePassConnectionConfig, TOnePassVault } from "./1password-connection-types";

export const getOnePassInstanceUrl = async (config: TOnePassConnectionConfig) => {
  const instanceUrl = removeTrailingSlash(config.credentials.instanceUrl);

  await blockLocalAndPrivateIpAddresses(instanceUrl);

  return instanceUrl;
};

export const getOnePassConnectionListItem = () => {
  return {
    name: "1Password" as const,
    app: AppConnection.OnePass as const,
    methods: Object.values(OnePassConnectionMethod) as [OnePassConnectionMethod.ApiToken]
  };
};

export const validateOnePassConnectionCredentials = async (config: TOnePassConnectionConfig) => {
  const instanceUrl = await getOnePassInstanceUrl(config);

  const { apiToken } = config.credentials;

  try {
    await request.get(`${instanceUrl}/v1/vaults`, {
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

export const listOnePassVaults = async (appConnection: TOnePassConnection) => {
  const instanceUrl = await getOnePassInstanceUrl(appConnection);
  const { apiToken } = appConnection.credentials;

  const resp = await request.get<TOnePassVault[]>(`${instanceUrl}/v1/vaults`, {
    headers: {
      Authorization: `Bearer ${apiToken}`,
      Accept: "application/json"
    }
  });

  return resp.data;
};
