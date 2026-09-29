import { AxiosError } from "axios";

import { getConfig } from "@app/lib/config/env";
import { request } from "@app/lib/config/request";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  decryptAppConnectionCredentials,
  encryptAppConnectionCredentials
} from "@app/services/app-connection/app-connection-fns";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

import { TAppConnectionDALFactory } from "../app-connection-dal";
import { StripeConnectionMethod } from "./stripe-connection-enums";
import {
  getStripeAppRequestConfig,
  getStripeSecretKey,
  STRIPE_API_KEYS_URL,
  throwStripeApiKeyManagementError
} from "./stripe-connection-public-client";
import { TStripeConnectionConfig, TStripeConnectionCredentials } from "./stripe-connection-types";

type TStripeOAuthTokenResponse = {
  refresh_token?: string;
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
    // A published app's install link is the marketplace URL plus the client ID, which the frontend
    // appends along with the redirect URI it is actually on. Only the test-mode and sandbox links
    // are per-app strings out of the Stripe dashboard, so those are the override.
    oauthAuthorizeUrl: INF_APP_CONNECTION_STRIPE_OAUTH_AUTHORIZE_URL || IntegrationUrls.STRIPE_APP_AUTHORIZE_URL
  };
};

const requestStripeTokens = async (params: Record<string, string>) => {
  const { data } = await request.post<TStripeOAuthTokenResponse>(
    IntegrationUrls.STRIPE_TOKEN_URL,
    new URLSearchParams(params),
    {
      auth: { username: getStripeSecretKey(), password: "" },
      headers: { "Content-Type": "application/x-www-form-urlencoded" }
    }
  );

  return data;
};

const getStripeOAuthErrorDescription = (error: AxiosError) =>
  (error.response?.data as { error_description?: string } | undefined)?.error_description ?? error.message;

const isStripeRefreshTokenRejected = (error: unknown) =>
  error instanceof AxiosError && (error.response?.data as { error?: string } | undefined)?.error === "invalid_grant";

/**
 * The exchange is also the only proof that the installer controls the account they are claiming: a
 * client-supplied account ID would be unverified.
 */
const exchangeStripeOAuthCode = async (code: string): Promise<TStripeConnectionCredentials> => {
  let data: TStripeOAuthTokenResponse;

  try {
    data = await requestStripeTokens({ grant_type: "authorization_code", code });
  } catch (error) {
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Stripe rejected the app installation: ${getStripeOAuthErrorDescription(error)}`
      });
    }

    throw error;
  }

  const accountId = data?.stripe_user_id ?? data?.account_id;

  if (!accountId || !data.refresh_token) {
    throw new BadRequestError({
      message:
        "Stripe did not return an account ID and refresh token for the installed app. Reinstall the app and try again."
    });
  }

  return { accountId, refreshToken: data.refresh_token };
};

/**
 * Probes the Managed API Keys API with the same credentials rotation will use, so a connection that
 * cannot manage keys fails here rather than at rotation time.
 */
const assertCanManageApiKeys = async (accountId: string) => {
  try {
    await request.get(STRIPE_API_KEYS_URL, getStripeAppRequestConfig(accountId));
  } catch (error) {
    throwStripeApiKeyManagementError(accountId, error);
  }
};

export const validateStripeConnectionCredentials = async (config: TStripeConnectionConfig) => {
  const credentials = await exchangeStripeOAuthCode(config.credentials.code);

  await assertCanManageApiKeys(credentials.accountId);

  return credentials;
};

const getStoredStripeConnection = async (
  connectionId: string,
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById">,
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">
) => {
  const appConnection = await appConnectionDAL.findById(connectionId);

  if (!appConnection) {
    throw new NotFoundError({ message: `Connection with ID '${connectionId}' not found` });
  }

  if (appConnection.app !== AppConnection.Stripe) {
    throw new BadRequestError({ message: `Connection with ID '${connectionId}' is not a Stripe connection` });
  }

  const credentials = (await decryptAppConnectionCredentials({
    orgId: appConnection.orgId,
    projectId: appConnection.projectId,
    encryptedCredentials: appConnection.encryptedCredentials,
    kmsService
  })) as TStripeConnectionCredentials;

  return { appConnection, credentials };
};

const throwStripeAuthorizationError = (accountId: string, error: AxiosError): never => {
  if (isStripeRefreshTokenRejected(error)) {
    throw new BadRequestError({
      message: `Infisical is no longer authorized on Stripe account '${accountId}': ${getStripeOAuthErrorDescription(error)}. This happens when the Infisical app is uninstalled from the Stripe account. Reinstall the app and reconnect this connection.`
    });
  }

  throw new BadRequestError({
    message: `Infisical could not confirm its access to Stripe account '${accountId}': ${getStripeOAuthErrorDescription(error)}`
  });
};

/**
 * Every call Infisical makes to the Managed API Keys API uses the app's own key, which works on any
 * account that has the app installed. Stripe revokes a connection's refresh token when the app is
 * uninstalled and never restores it on a reinstall, so refreshing before each operation is what
 * stops a connection made before an uninstall from acting on the account again. A cached result
 * would leave that window open, so this always goes to Stripe.
 */
export const assertStripeConnectionAuthorized = async (
  connectionId: string,
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById" | "updateById">,
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">
): Promise<void> => {
  const { appConnection, credentials } = await getStoredStripeConnection(connectionId, appConnectionDAL, kmsService);

  let data: TStripeOAuthTokenResponse;

  try {
    data = await requestStripeTokens({ grant_type: "refresh_token", refresh_token: credentials.refreshToken });
  } catch (error) {
    if (!(error instanceof AxiosError)) throw error;

    // Refresh tokens are single-use, so a refresh that raced another one for the same connection is
    // rejected too. Retrying with the token the other refresh stored tells that apart from a revoked
    // install, without trusting the other refresh's result.
    const { credentials: latest } = await getStoredStripeConnection(connectionId, appConnectionDAL, kmsService);

    if (!isStripeRefreshTokenRejected(error) || latest.refreshToken === credentials.refreshToken) {
      return throwStripeAuthorizationError(credentials.accountId, error);
    }

    try {
      data = await requestStripeTokens({ grant_type: "refresh_token", refresh_token: latest.refreshToken });
    } catch (retryError) {
      if (!(retryError instanceof AxiosError)) throw retryError;

      return throwStripeAuthorizationError(credentials.accountId, retryError);
    }
  }

  const returnedAccountId = data?.stripe_user_id ?? data?.account_id;

  if (returnedAccountId && returnedAccountId !== credentials.accountId) {
    throw new BadRequestError({
      message: `Stripe returned tokens for account '${returnedAccountId}', but this connection is bound to '${credentials.accountId}'. Reconnect the app on the original account.`
    });
  }

  if (!data?.refresh_token) {
    throw new BadRequestError({
      message: `Stripe did not return a new refresh token for account '${credentials.accountId}'. Reconnect the app and try again.`
    });
  }

  const encryptedCredentials = await encryptAppConnectionCredentials({
    credentials: { accountId: credentials.accountId, refreshToken: data.refresh_token },
    orgId: appConnection.orgId,
    projectId: appConnection.projectId,
    kmsService
  });

  await appConnectionDAL.updateById(appConnection.id, { encryptedCredentials });
};
