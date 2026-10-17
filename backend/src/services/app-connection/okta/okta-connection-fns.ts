import { UnauthorizedError } from "@app/lib/errors";
import { removeTrailingSlash } from "@app/lib/fn";
import { logger, sanitizeUrlForLog } from "@app/lib/logger";
import { blockLocalAndPrivateIpAddresses, safeRequest } from "@app/lib/validator";
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
    await safeRequest.get(`${instanceUrl}/api/v1/users/me`, {
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

// Okta documents the `next` link as opaque, so it is followed rather than rebuilt. It is still
// constrained to the instance origin: the link arrives in a response header and the host is
// user-supplied, so a `next` pointing elsewhere must not be handed the API token. Origins are
// compared parsed rather than as strings, since a configured `https://EXAMPLE.okta.com:443` and the
// canonical host Okta echoes back are the same origin spelled differently.
const $getNextLink = (linkHeader: string | undefined, instanceUrl: string) => {
  const nextLink = linkHeader?.split(",").find((part) => part.includes('rel="next"'));
  if (!nextLink) return null;

  const url = nextLink.trim().split(";")[0].slice(1, -1);

  try {
    if (new URL(url).origin !== new URL(instanceUrl).origin) return null;
  } catch {
    return null;
  }

  return url;
};

export const listOktaApps = async (appConnection: TOktaConnection) => {
  const { apiToken } = appConnection.credentials;
  const instanceUrl = await getOktaInstanceUrl(appConnection);

  const apps: TOktaApp[] = [];
  let url: string | null = `${instanceUrl}/api/v1/apps?limit=${OKTA_APPS_PER_PAGE}`;

  for (let page = 0; page < OKTA_APPS_MAX_PAGES && url; page += 1) {
    // eslint-disable-next-line no-await-in-loop
    const response = await safeRequest.get<TOktaApp[]>(url, {
      headers: {
        Accept: "application/json",
        Authorization: `SSWS ${apiToken}`
      }
    });

    apps.push(...response.data);
    url = $getNextLink(response.headers.link as string | undefined, instanceUrl);
  }

  if (url) {
    logger.warn(
      `listOktaApps: page cap reached, returning a partial list [instanceUrl=${sanitizeUrlForLog(instanceUrl)}] [pagesRead=${OKTA_APPS_MAX_PAGES}]`
    );
  }

  return apps.filter((app) => app.status === "ACTIVE" && app.name === "oidc_client");
};
