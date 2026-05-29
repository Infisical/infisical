import { request } from "@app/lib/config/request";
import { UnauthorizedError } from "@app/lib/errors";
import { removeTrailingSlash } from "@app/lib/fn";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { OktaConnectionMethod } from "./okta-connection-enums";
import { TOktaApp, TOktaConnection, TOktaConnectionConfig } from "./okta-connection-types";

export const getOktaConnectionListItem = () => {
  return {
    name: "Okta" as const,
    app: AppConnection.Okta as const,
    methods: Object.values(OktaConnectionMethod) as [OktaConnectionMethod.ApiToken]
  };
};

export const getOktaInstanceUrl = async (config: TOktaConnectionConfig) => {
  const instanceUrl = removeTrailingSlash(config.credentials.instanceUrl);
  await blockLocalAndPrivateIpAddresses(instanceUrl);
  return instanceUrl;
};

export const validateOktaConnectionCredentials = async (config: TOktaConnectionConfig) => {
  const { apiToken } = config.credentials;
  const instanceUrl = await getOktaInstanceUrl(config);

  try {
    await request.get(`${instanceUrl}/api/v1/users/me`, {
      headers: {
        Accept: "application/json",
        Authorization: `SSWS ${apiToken}`
      },
      validateStatus: (status) => status === 200
    });
  } catch (error: unknown) {
    throw new UnauthorizedError({
      message: "Unable to validate connection: invalid credentials"
    });
  }

  return config.credentials;
};

export const listOktaApps = async (appConnection: TOktaConnection) => {
  const { apiToken } = appConnection.credentials;
  const instanceUrl = await getOktaInstanceUrl(appConnection);

  const { data } = await request.get<TOktaApp[]>(`${instanceUrl}/api/v1/apps`, {
    headers: {
      Accept: "application/json",
      Authorization: `SSWS ${apiToken}`
    }
  });

  return data.filter((app) => app.status === "ACTIVE" && app.name === "oidc_client");
};
