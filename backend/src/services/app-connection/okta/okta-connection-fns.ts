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

// Okta caps `limit` at 200 on /api/v1/apps and defaults it far lower, so the full list only arrives by
// following the `next` link it returns.
const OKTA_APPS_PER_PAGE = 200;
const OKTA_APPS_MAX_PAGES = 100;

// Okta documents the `next` link as opaque, so it is followed rather than rebuilt. It still has to be
// re-validated: it comes from the response body's headers, and the instance host is user-supplied.
const $getNextLink = (linkHeader: string | undefined, instanceUrl: string) => {
  const nextLink = linkHeader?.split(",").find((part) => part.includes('rel="next"'));
  if (!nextLink) return null;

  const url = nextLink.trim().split(";")[0].slice(1, -1);
  if (!url.startsWith(`${instanceUrl}/`)) return null;

  return url;
};

export const listOktaApps = async (appConnection: TOktaConnection) => {
  const { apiToken } = appConnection.credentials;
  const instanceUrl = await getOktaInstanceUrl(appConnection);

  const apps: TOktaApp[] = [];
  let url: string | null = `${instanceUrl}/api/v1/apps?limit=${OKTA_APPS_PER_PAGE}`;

  for (let page = 0; page < OKTA_APPS_MAX_PAGES && url; page += 1) {
    // eslint-disable-next-line no-await-in-loop
    const response = await request.get<TOktaApp[]>(url, {
      headers: {
        Accept: "application/json",
        Authorization: `SSWS ${apiToken}`
      }
    });

    apps.push(...response.data);
    url = $getNextLink(response.headers.link as string | undefined, instanceUrl);
  }

  return apps.filter((app) => app.status === "ACTIVE" && app.name === "oidc_client");
};
