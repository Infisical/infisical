import { AxiosError } from "axios";

import { getConfig } from "@app/lib/config/env";
import { request } from "@app/lib/config/request";
import { BadRequestError, InternalServerError } from "@app/lib/errors";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";

import { StripeConnectionMethod } from "./stripe-connection-enums";
import { TStripeConnectionConfig } from "./stripe-connection-types";

// The Managed API Keys API is in private preview and is only served under a preview API version.
const STRIPE_PREVIEW_API_VERSION = "2026-08-26.preview";

type TStripeOAuthTokenResponse = {
  // The initial exchange names the account stripe_user_id; the refresh grant names it account_id.
  stripe_user_id?: string;
  account_id?: string;
};

const getStripeSecretKey = () => {
  const { INF_APP_CONNECTION_STRIPE_SECRET_KEY } = getConfig();

  if (!INF_APP_CONNECTION_STRIPE_SECRET_KEY) {
    throw new InternalServerError({
      message: "Stripe is not configured on this instance. Set the Stripe App Connection credentials to enable it."
    });
  }

  return INF_APP_CONNECTION_STRIPE_SECRET_KEY;
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
    await request.get(`${IntegrationUrls.STRIPE_API_URL}/v2/iam/api_keys`, {
      auth: { username: getStripeSecretKey(), password: "" },
      headers: {
        "Stripe-Version": STRIPE_PREVIEW_API_VERSION,
        "Stripe-Context": accountId
      }
    });
  } catch (error) {
    if (error instanceof AxiosError) {
      const message = (error.response?.data as { error?: { message?: string } } | undefined)?.error?.message;

      throw new BadRequestError({
        message: `Infisical cannot manage API keys on Stripe account '${accountId}'. Stripe returned ${
          error.response?.status ?? "no status"
        }: ${message ?? error.message}`
      });
    }

    throw error;
  }
};

export const validateStripeConnectionCredentials = async (config: TStripeConnectionConfig) => {
  const accountId = await exchangeStripeOAuthCode(config.credentials.code);

  await assertCanManageApiKeys(accountId);

  return { accountId };
};
