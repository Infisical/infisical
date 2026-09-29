/* eslint-disable no-await-in-loop */
import crypto from "node:crypto";

import { AxiosError, AxiosRequestConfig } from "axios";

import { getConfig } from "@app/lib/config/env";
import { BadRequestError, InternalServerError } from "@app/lib/errors";
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
