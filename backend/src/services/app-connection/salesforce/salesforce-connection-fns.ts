import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { removeTrailingSlash } from "@app/lib/fn";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { SalesforceConnectionMethod } from "./salesforce-connection-enums";
import { TSalesforceConnectionConfig, TSalesforceTokenResponse } from "./salesforce-connection-types";

export const getSalesforceConnectionListItem = () => {
  return {
    name: "Salesforce" as const,
    app: AppConnection.Salesforce as const,
    methods: Object.values(SalesforceConnectionMethod) as [SalesforceConnectionMethod.ClientCredentials]
  };
};

export const validateSalesforceConnectionCredentials = async ({ credentials }: TSalesforceConnectionConfig) => {
  const { instanceUrl, consumerKey, consumerSecret } = credentials;

  const normalizedInstanceUrl = instanceUrl.startsWith("https") ? instanceUrl : `https://${instanceUrl}`;
  await blockLocalAndPrivateIpAddresses(normalizedInstanceUrl);

  try {
    const { data } = await request.request<TSalesforceTokenResponse>({
      method: "POST",
      url: `${removeTrailingSlash(normalizedInstanceUrl)}/services/oauth2/token`,
      headers: { "content-type": "application/x-www-form-urlencoded" },
      data: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: consumerKey,
        client_secret: consumerSecret
      })
    });

    if (data.token_type !== "Bearer") {
      throw new BadRequestError({
        message: `Unable to validate Salesforce connection: unexpected token type "${data.token_type}".`
      });
    }
  } catch (error: unknown) {
    if (error instanceof BadRequestError) throw error;
    throw new BadRequestError({
      message: `Failed to validate credentials: ${(error as Error).message ?? "verify credentials"}`
    });
  }

  return credentials;
};
