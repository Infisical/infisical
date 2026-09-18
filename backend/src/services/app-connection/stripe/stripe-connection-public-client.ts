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

/** Infisical acting on a customer's account: our own key, with Stripe-Context naming the account. */
export const getStripePlatformRequestConfig = (accountId: string): AxiosRequestConfig => ({
  auth: { username: getStripeSecretKey(), password: "" },
  headers: {
    "Stripe-Version": STRIPE_PREVIEW_API_VERSION,
    "Stripe-Context": accountId
  }
});

/** A rotated merchant key acting as itself. It is not the platform, so it carries neither header. */
export const getStripeMerchantRequestConfig = (apiKey: string): AxiosRequestConfig => ({
  auth: { username: apiKey, password: "" }
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
 */
export const throwStripeApiKeyManagementError = (accountId: string, error: unknown): never => {
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

export const listStripeApiKeys = async (accountId: string): Promise<TStripeApiKeyListItem[]> => {
  const config = getStripePlatformRequestConfig(accountId);
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

    keys.push(...(response.data?.data ?? []));
    url = response.data?.next_page_url ?? undefined;
    pages += 1;
  }

  if (url) {
    logger.warn(
      `listStripeApiKeys: stopped after ${STRIPE_LIST_MAX_PAGES} pages for account ${accountId}, the list is truncated`
    );
  }

  return keys;
};
