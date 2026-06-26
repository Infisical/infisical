import { AxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { removeTrailingSlash } from "@app/lib/fn";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";

import { AppConnection } from "../app-connection-enums";
import { QoveryConnectionMethod } from "./qovery-connection-enums";
import { TQoveryConnectionConfig } from "./qovery-connection-types";

export const QOVERY_DEFAULT_API_URL = "https://api.qovery.com";

export const getQoveryInstanceUrl = async (config: TQoveryConnectionConfig) => {
  const instanceUrl = config.credentials.instanceUrl
    ? removeTrailingSlash(config.credentials.instanceUrl)
    : QOVERY_DEFAULT_API_URL;

  await blockLocalAndPrivateIpAddresses(instanceUrl);

  return instanceUrl;
};

export const getQoveryConnectionListItem = () => {
  return {
    name: "Qovery" as const,
    app: AppConnection.Qovery as const,
    methods: Object.values(QoveryConnectionMethod) as [QoveryConnectionMethod.AccessToken]
  };
};

export const validateQoveryConnectionCredentials = async (config: TQoveryConnectionConfig) => {
  const instanceUrl = await getQoveryInstanceUrl(config);
  const { accessToken } = config.credentials;

  try {
    await request.get(`${instanceUrl}/organization`, {
      headers: {
        Authorization: `Token ${accessToken}`,
        Accept: "application/json"
      }
    });
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to validate Qovery credentials: ${error.message || "Unknown error"}`
      });
    }

    throw new BadRequestError({
      message: "Failed to validate Qovery credentials - verify the project access token is correct"
    });
  }

  return config.credentials;
};
