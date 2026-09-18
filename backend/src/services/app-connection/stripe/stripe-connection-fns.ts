import { AxiosError } from "axios";

import { getConfig } from "@app/lib/config/env";
import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";

import { StripeConnectionMethod } from "./stripe-connection-enums";
import {
  getStripePlatformRequestConfig,
  getStripeSecretKey,
  STRIPE_API_KEYS_URL,
  throwStripeApiKeyManagementError
} from "./stripe-connection-public-client";
import { TStripeConnectionConfig } from "./stripe-connection-types";

type TStripeOAuthTokenResponse = {
  // The initial exchange names the account stripe_user_id; the refresh grant names it account_id.
  stripe_user_id?: string;
  account_id?: string;
};

export const getStripeConnectionListItem = () => {
  const { INF_APP_CONNECTION_STRIPE_OAUTH_CLIENT_ID, INF_APP_CONNECTION_STRIPE_OAUTH_AUTHORIZE_URL } = getConfig();

  return {
    name: "Stripe" as const,
    app: AppConnection.Stripe as const,
    methods: Object.values(StripeConnectionMethod) as [StripeConnectionMethod.OAuth],
    oauthClientId: INF_APP_CONNECTION_STRIPE_OAUTH_CLIENT_ID,
    // Stripe embeds a per-app, per-mode channel link ID in the install URL path, so it cannot be
    // derived from the client ID and has to be copied out of the Stripe dashboard.
    oauthAuthorizeUrl: INF_APP_CONNECTION_STRIPE_OAUTH_AUTHORIZE_URL
  };
};

/**
 * Infisical authenticates as itself and names the customer with Stripe-Context, so the tokens this
 * exchange returns are never used. It runs because it is the only proof that the installer controls
 * the account they are claiming: a client-supplied account ID would be unverified.
 */
const exchangeStripeOAuthCode = async (code: string): Promise<string> => {
  let data: TStripeOAuthTokenResponse;

  try {
    ({ data } = await request.post<TStripeOAuthTokenResponse>(
      IntegrationUrls.STRIPE_TOKEN_URL,
      new URLSearchParams({ grant_type: "authorization_code", code }),
      {
        auth: { username: getStripeSecretKey(), password: "" },
        headers: { "Content-Type": "application/x-www-form-urlencoded" }
      }
    ));
  } catch (error) {
    if (error instanceof AxiosError) {
      const description = (error.response?.data as { error_description?: string } | undefined)?.error_description;

      throw new BadRequestError({
        message: `Stripe rejected the app installation: ${description ?? error.message}`
      });
    }

    throw error;
  }

  const accountId = data?.stripe_user_id ?? data?.account_id;

  if (!accountId) {
    throw new BadRequestError({
      message: "Stripe did not return an account ID for the installed app. Reinstall the app and try again."
    });
  }

  return accountId;
};

/**
 * Probes the Managed API Keys API with the same credentials rotation will use, so a connection that
 * cannot manage keys fails here rather than at rotation time.
 */
const assertCanManageApiKeys = async (accountId: string) => {
  try {
    await request.get(STRIPE_API_KEYS_URL, getStripePlatformRequestConfig(accountId));
  } catch (error) {
    throwStripeApiKeyManagementError(accountId, error);
  }
};

export const validateStripeConnectionCredentials = async (config: TStripeConnectionConfig) => {
  const accountId = await exchangeStripeOAuthCode(config.credentials.code);

  await assertCanManageApiKeys(accountId);

  return { accountId };
};
