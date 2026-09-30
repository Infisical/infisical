import { AxiosError } from "axios";

import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { request } from "@app/lib/config/request";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
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

type TStripeOAuthErrorResponse = {
  error?: string;
  // Never surfaced or logged: OAuth error descriptions can echo the code or token they rejected.
  error_description?: string;
};

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

// Long enough to cover a slow token call, which is the only thing done while holding it.
const REFRESH_LOCK_DURATION_MS = 30 * 1000;

// Another refresh for the same connection holds the lock for one token call, so waiting up to about
// fifteen seconds rides out a queue of several without turning a stuck lock into a hung rotation.
const REFRESH_LOCK_SETTINGS = { retryCount: 60, retryDelay: 250, retryJitter: 100 };

export type TStripeConnectionAuthorizationDeps = {
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById" | "updateById" | "transaction">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  keyStore: Pick<TKeyStoreFactory, "acquireLock">;
};

const requestStripeTokens = async (params: Record<string, string>) => {
  const { data } = await request.post<TStripeOAuthTokenResponse>(
    IntegrationUrls.STRIPE_TOKEN_URL,
    new URLSearchParams(params),
    {
      headers: {
        Authorization: `Bearer ${getStripeSecretKey()}`,
        "Content-Type": "application/x-www-form-urlencoded"
      }
    }
  );

  return data;
};

const getStripeOAuthErrorCode = (error: AxiosError) =>
  (error.response?.data as TStripeOAuthErrorResponse | undefined)?.error;

/**
 * The exchange is also the only proof that the installer controls the account they are claiming: a
 * client-supplied account ID would be unverified.
 */
const exchangeStripeOAuthCode = async (code: string): Promise<TStripeConnectionCredentials> => {
  let data: TStripeOAuthTokenResponse;

  try {
    data = await requestStripeTokens({ grant_type: "authorization_code", code });
  } catch (error) {
    if (!(error instanceof AxiosError)) throw error;

    const errorCode = getStripeOAuthErrorCode(error);

    logger.warn(
      `exchangeStripeOAuthCode: Stripe rejected the authorization code [status=${error.response?.status}] [error=${errorCode}]`
    );

    throw new BadRequestError({
      message:
        errorCode === "invalid_grant"
          ? "The Stripe authorization expired or was already used. Install the app from Stripe again to reconnect."
          : `Stripe rejected the app installation (status ${error.response?.status ?? "unknown"}). Install the app from Stripe again to reconnect.`
    });
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
  if (!getConfig().WHITELISTED_STRIPE_APP_CONNECTION_ORG_IDS?.includes(config.orgId)) {
    throw new BadRequestError({ message: `Your organization does not support Stripe app connections yet.` });
  }

  const credentials = await exchangeStripeOAuthCode(config.credentials.code);

  await assertCanManageApiKeys(credentials.accountId);

  return credentials;
};

/**
 * Read from the primary, since the connection's last refresh may have written the token a moment ago
 * and a replica that has not caught up would hand back one Stripe has already spent.
 */
const getStoredStripeConnection = async (
  connectionId: string,
  { appConnectionDAL, kmsService }: Pick<TStripeConnectionAuthorizationDeps, "appConnectionDAL" | "kmsService">
) => {
  const appConnection = await appConnectionDAL.transaction((tx) => appConnectionDAL.findById(connectionId, tx));

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

const refreshStripeConnection = async (connectionId: string, deps: TStripeConnectionAuthorizationDeps) => {
  const { appConnection, credentials } = await getStoredStripeConnection(connectionId, deps);
  const { accountId } = credentials;

  let data: TStripeOAuthTokenResponse;

  try {
    data = await requestStripeTokens({ grant_type: "refresh_token", refresh_token: credentials.refreshToken });
  } catch (error) {
    if (!(error instanceof AxiosError)) throw error;

    const errorCode = getStripeOAuthErrorCode(error);

    logger.warn(
      `assertStripeConnectionAuthorized: Stripe rejected the token refresh [connectionId=${connectionId}] [accountId=${accountId}] [status=${error.response?.status}] [error=${errorCode}]`
    );

    throw new BadRequestError({
      message:
        errorCode === "invalid_grant"
          ? `Infisical is no longer authorized on Stripe account '${accountId}'. This happens when the Infisical app is uninstalled from the Stripe account. Reinstall the app and reconnect this connection.`
          : `Infisical could not confirm its access to Stripe account '${accountId}' (status ${error.response?.status ?? "unknown"}). Try again shortly.`
    });
  }

  const returnedAccountId = data?.stripe_user_id ?? data?.account_id;

  if (returnedAccountId && returnedAccountId !== accountId) {
    throw new BadRequestError({
      message: `Stripe returned tokens for account '${returnedAccountId}', but this connection is bound to '${accountId}'. Reconnect the app on the original account.`
    });
  }

  if (!data?.refresh_token) {
    throw new BadRequestError({
      message: `Stripe did not return a new refresh token for account '${accountId}'. Reconnect the app and try again.`
    });
  }

  const encryptedCredentials = await encryptAppConnectionCredentials({
    credentials: { accountId, refreshToken: data.refresh_token },
    orgId: appConnection.orgId,
    projectId: appConnection.projectId,
    kmsService: deps.kmsService
  });

  try {
    await deps.appConnectionDAL.updateById(appConnection.id, { encryptedCredentials });
  } catch (error) {
    // Stripe has already spent the stored token, so the connection cannot recover from this on its own.
    logger.error(
      error,
      `assertStripeConnectionAuthorized: failed to store the refreshed Stripe token [connectionId=${connectionId}] [accountId=${accountId}]`
    );
    throw new BadRequestError({
      message: `Infisical refreshed its access to Stripe account '${accountId}' but could not save it. Reinstall the app and reconnect this connection.`
    });
  }
};

/**
 * Every call Infisical makes to the Managed API Keys API uses the app's own key, which works on any
 * account that has the app installed. Stripe revokes a connection's refresh token when the app is
 * uninstalled and never restores it on a reinstall, so refreshing before each operation is what
 * stops a connection made before an uninstall from acting on the account again. A cached result
 * would leave that window open, so this always goes to Stripe.
 *
 * Refresh tokens are single-use, so two operations on one connection must not refresh at once: the
 * second would present a token the first just spent. The lock is held only around the token call and
 * the write that stores its result, and is in Redis because a database lock would hold a connection
 * open across the HTTP call.
 */
export const assertStripeConnectionAuthorized = async (
  connectionId: string,
  deps: TStripeConnectionAuthorizationDeps
): Promise<void> => {
  let lock: Awaited<ReturnType<TStripeConnectionAuthorizationDeps["keyStore"]["acquireLock"]>>;

  try {
    lock = await deps.keyStore.acquireLock(
      [KeyStorePrefixes.StripeConnectionRefreshLock(connectionId)],
      REFRESH_LOCK_DURATION_MS,
      REFRESH_LOCK_SETTINGS
    );
  } catch {
    throw new BadRequestError({
      message: "Another operation on this Stripe connection is still in progress. Try again shortly."
    });
  }

  try {
    await refreshStripeConnection(connectionId, deps);
  } finally {
    await lock.release().catch((error) => {
      logger.warn(
        error,
        `assertStripeConnectionAuthorized: failed to release the refresh lock [connectionId=${connectionId}]`
      );
    });
  }
};
