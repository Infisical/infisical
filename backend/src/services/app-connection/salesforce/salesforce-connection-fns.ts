import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { removeTrailingSlash } from "@app/lib/fn";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { SalesforceConnectionMethod } from "./salesforce-connection-enums";
import {
  TSalesforceConnection,
  TSalesforceConnectionConfig,
  TSalesforceOauthApp,
  TSalesforceOauthUsageResponse,
  TSalesforceTokenResponse
} from "./salesforce-connection-types";

export const SALESFORCE_API_VERSION = "v65.0";

const normalizeInstanceUrl = (instanceUrl: string) =>
  removeTrailingSlash(instanceUrl.startsWith("http") ? instanceUrl : `https://${instanceUrl}`);

export const getSalesforceConnectionListItem = () => {
  return {
    name: "Salesforce" as const,
    app: AppConnection.Salesforce as const,
    methods: Object.values(SalesforceConnectionMethod) as [SalesforceConnectionMethod.ClientCredentials]
  };
};

export const getSalesforceConnectionAccessToken = async (
  credentials: TSalesforceConnection["credentials"]
): Promise<{ accessToken: string; instanceUrl: string }> => {
  const { instanceUrl, consumerKey, consumerSecret } = credentials;
  const normalizedInstanceUrl = normalizeInstanceUrl(instanceUrl);
  await blockLocalAndPrivateIpAddresses(normalizedInstanceUrl);

  const { data } = await request.request<TSalesforceTokenResponse>({
    method: "POST",
    url: `${normalizedInstanceUrl}/services/oauth2/token`,
    headers: { "content-type": "application/x-www-form-urlencoded" },
    data: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: consumerKey,
      client_secret: consumerSecret
    })
  });

  if (data.token_type !== "Bearer") {
    throw new BadRequestError({
      message: `Unable to authenticate Salesforce connection: unexpected token type "${data.token_type}".`
    });
  }

  return { accessToken: data.access_token, instanceUrl: normalizedInstanceUrl };
};

// Cap pagination so a misbehaving Salesforce response cannot make this loop unbounded.
const SALESFORCE_OAUTH_APPS_PAGE_LIMIT = 10;

export const listSalesforceConnectionOauthApps = async (
  appConnection: TSalesforceConnection
): Promise<TSalesforceOauthApp[]> => {
  const { accessToken, instanceUrl } = await getSalesforceConnectionAccessToken(appConnection.credentials);
  const headers = { Authorization: `Bearer ${accessToken}`, Accept: "application/json" };

  const apps: TSalesforceOauthApp[] = [];
  let nextUrl: string | null = `/services/data/${SALESFORCE_API_VERSION}/apps/oauth/usage`;

  for (let page = 0; page < SALESFORCE_OAUTH_APPS_PAGE_LIMIT && nextUrl; page += 1) {
    const url: string = `${instanceUrl}${nextUrl}`;
    // eslint-disable-next-line no-await-in-loop
    const response = await request.request<TSalesforceOauthUsageResponse>({
      method: "GET",
      url,
      headers
    });

    apps.push(...(response.data.apps ?? []));
    nextUrl = response.data.nextPageUrl ?? null;
  }

  return apps;
};

export const validateSalesforceConnectionCredentials = async ({ credentials }: TSalesforceConnectionConfig) => {
  try {
    await getSalesforceConnectionAccessToken(credentials);
  } catch (error: unknown) {
    if (error instanceof BadRequestError) throw error;
    throw new BadRequestError({
      message: `Failed to validate credentials: ${(error as Error).message ?? "verify credentials"}`
    });
  }

  return credentials;
};
