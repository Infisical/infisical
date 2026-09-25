/* eslint-disable no-await-in-loop */
import crypto from "node:crypto";

import { AxiosError, AxiosRequestConfig, AxiosResponse } from "axios";

import { getConfig } from "@app/lib/config/env";
import { request } from "@app/lib/config/request";
import { BadRequestError, InternalServerError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";

// The Managed API Keys API is in private preview and is only served under a preview API version.
export const STRIPE_PREVIEW_API_VERSION = "2026-08-26.preview";

export const STRIPE_API_KEYS_URL = `${IntegrationUrls.STRIPE_API_URL}/v2/iam/api_keys`;

export const getStripeSecretKey = () => {
  const { INF_APP_CONNECTION_STRIPE_SECRET_KEY } = getConfig();

  if (!INF_APP_CONNECTION_STRIPE_SECRET_KEY) {
    throw new InternalServerError({
      message: "Stripe is not configured on this instance. Set the Stripe App Connection credentials to enable it."
    });
  }

  return INF_APP_CONNECTION_STRIPE_SECRET_KEY;
};

/** The Infisical Stripe App acting on a customer's account, named by Stripe-Context. */
export const getStripeAppRequestConfig = (accountId: string): AxiosRequestConfig => ({
  headers: {
    Authorization: `Bearer ${getStripeSecretKey()}`,
    "Stripe-Version": STRIPE_PREVIEW_API_VERSION,
    "Stripe-Context": accountId
  }
});

/** A rotated merchant key acting as itself, so it carries neither of the app's headers. */
export const getStripeMerchantRequestConfig = (apiKey: string): AxiosRequestConfig => ({
  headers: { Authorization: `Bearer ${apiKey}` }
});

export const withIdempotencyKey = (config: AxiosRequestConfig): AxiosRequestConfig => ({
  ...config,
  headers: { ...config.headers, "Idempotency-Key": crypto.randomUUID() }
});

export const getStripeErrorMessage = (error: unknown): string => {
  if (error instanceof AxiosError) {
    const message = (error.response?.data as { error?: { message?: string } } | undefined)?.error?.message;

    return typeof message === "string" ? message : error.message;
  }

  return (error as Error)?.message ?? "Unknown error";
};

export const getStripeErrorStatus = (error: unknown): number | undefined =>
  error instanceof AxiosError ? error.response?.status : undefined;

/**
 * Nothing proactively notices that a customer uninstalled the app, because the connection stores no
 * tokens, so it arrives here as a 403. The remedy is offered conditionally rather than asserted.
 *
 * Only an Axios error is actually a response from Stripe. Anything else, eg a local
 * misconfiguration like a missing app key, gets rethrown as itself rather than reworded into
 * a message that blames Stripe or the installed app for something neither caused.
 */
export const throwStripeApiKeyManagementError = (accountId: string, error: unknown): never => {
  if (!(error instanceof AxiosError)) throw error;

  throw new BadRequestError({
    message:
      `Infisical cannot manage API keys on Stripe account '${accountId}'. ` +
      `Stripe returned ${getStripeErrorStatus(error) ?? "no status"}: ${getStripeErrorMessage(error)}. ` +
      `If the Infisical app was removed from this Stripe account, reinstall it and reconnect.`
  });
};

export type TStripeApiKeyListItem = {
  id: string;
  name?: string | null;
  status?: string | null;
  permissions?: string[] | null;
  connect_permissions?: string[] | null;
};

type TStripeApiKeyListResponse = {
  data?: TStripeApiKeyListItem[];
  next_page_url?: string | null;
};

const STRIPE_LIST_PAGE_SIZE = 100;

// Stripe rejects limit=200 with "The maximum page limit is 100", so this is the largest page it
// serves. The page cap is a runaway guard, not an expected bound.
const STRIPE_LIST_MAX_PAGES = 50;

// Stripe's list response carries secret_key.token, in full plaintext, for every key in the account.
// TStripeApiKeyListItem omits it only at the type level, so rebuilding each item as a fresh object
// literal is what actually keeps the raw response object, and the secret it carries, from leaving
// this function. Downstream callers strip it again on their own responses; this is defense in depth.
const sanitizeApiKeyListItem = (item: TStripeApiKeyListItem): TStripeApiKeyListItem => ({
  id: item.id,
  name: item.name,
  status: item.status,
  permissions: item.permissions,
  connect_permissions: item.connect_permissions
});

export const listStripeApiKeys = async (accountId: string): Promise<TStripeApiKeyListItem[]> => {
  const config = getStripeAppRequestConfig(accountId);
  const keys: TStripeApiKeyListItem[] = [];

  let url: string | undefined = `${STRIPE_API_KEYS_URL}?limit=${STRIPE_LIST_PAGE_SIZE}`;
  let pages = 0;

  while (url && pages < STRIPE_LIST_MAX_PAGES) {
    // The explicit AxiosResponse annotation breaks a circular type-inference error TS raises when a
    // loop variable (url) is both an argument to this generic call and reassigned from its result.
    const response: AxiosResponse<TStripeApiKeyListResponse> = await request.get<TStripeApiKeyListResponse>(
      url,
      config
    );

    keys.push(...(response.data?.data ?? []).map(sanitizeApiKeyListItem));

    const nextPageUrl = response.data?.next_page_url ?? undefined;

    // config carries the app's own key, which can act on every account the app is installed on, not
    // a per-connection token. This must be checked before that credential goes out on the next
    // request, never after, since next_page_url comes from the response body Stripe controls.
    if (nextPageUrl && !nextPageUrl.startsWith(STRIPE_API_KEYS_URL)) {
      logger.error(
        `listStripeApiKeys: next_page_url for account ${accountId} did not point at the Stripe API keys endpoint, stopped paginating`
      );
      url = undefined;
    } else {
      url = nextPageUrl;
    }

    pages += 1;
  }

  if (url) {
    logger.warn(
      `listStripeApiKeys: stopped after ${STRIPE_LIST_MAX_PAGES} pages for account ${accountId}, the list is truncated`
    );
  }

  return keys;
};
