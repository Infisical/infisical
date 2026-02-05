import { AxiosError } from "axios";

import { getConfig } from "@app/lib/config/env";
import { request } from "@app/lib/config/request";
import { delay } from "@app/lib/delay";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator/validate-url";

import { PKI_ALERT_RETRY_CONFIG, RETRYABLE_NETWORK_ERRORS } from "./pki-alert-v2-constants";
import {
  TAlertInfo,
  TBuildSlackPayloadParams,
  TCertificatePreview,
  TChannelResult,
  TSlackBlock,
  TSlackChannelConfig,
  TSlackPayload
} from "./pki-alert-v2-types";

const SLACK_WEBHOOK_TIMEOUT = 7 * 1000;

/**
 * Validates a Slack webhook URL for security.
 *
 * Requirements:
 * - Must be HTTPS
 * - Hostname must be exactly "hooks.slack.com" (prevents bypass via hooks.slack.com.evil.com)
 * - Must not resolve to private/local IP addresses (SSRF protection)
 */
export const validateSlackWebhookUrl = async (url: string): Promise<void> => {
  const parsedUrl = new URL(url);

  // Must be HTTPS
  if (parsedUrl.protocol !== "https:") {
    throw new BadRequestError({ message: "Slack webhook URL must use HTTPS" });
  }

  // Hostname must be exactly hooks.slack.com (not .includes())
  // This prevents: hooks.slack.com.evil.com, evil.hooks.slack.com, etc.
  if (parsedUrl.hostname !== "hooks.slack.com") {
    throw new BadRequestError({
      message: "Invalid Slack webhook URL. Must be from hooks.slack.com"
    });
  }

  // SSRF protection - resolve DNS and block private IPs
  await blockLocalAndPrivateIpAddresses(url);
};

/**
 * Masks the Slack webhook URL path to hide the token in logs.
 * The path contains the webhook token which should not be exposed.
 *
 * Example: https://hooks.slack.com/services/T00/B00/XXX -> https://hooks.slack.com/services/***
 */
export const maskSlackWebhookUrl = (url: string): string => {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.hostname}/services/***`;
  } catch {
    return "***";
  }
};

/**
 * Builds a Slack Block Kit payload for certificate expiration alerts.
 *
 * Structure:
 * - Header block with alert name
 * - Alert info section (name, alertBefore)
 * - Summary section (N certificates expiring within alertBefore period)
 * - Certificate list (2 most urgent, ordered by expiry)
 * - "+N more" context if there are additional certificates
 * - Action button linking to Infisical
 */
export const buildSlackPayload = ({
  alert,
  certificates,
  appUrl = "https://app.infisical.com"
}: TBuildSlackPayloadParams): TSlackPayload => {
  const totalCertificates = certificates.length;
  const now = new Date();

  // Sort certificates by urgency (days until expiry, ascending - most urgent first)
  const sortedCertificates = [...certificates].sort((a, b) => {
    const aExpiry = new Date(a.notAfter).getTime();
    const bExpiry = new Date(b.notAfter).getTime();
    return aExpiry - bExpiry;
  });

  // Display only the 2 most urgent certificates
  const displayCertificates = sortedCertificates.slice(0, 2);
  const remainingCount = totalCertificates - displayCertificates.length;

  const viewUrl = `${appUrl}/projects/cert-manager/${alert.projectId}/policies`;

  const headerText = `Certificate Expiration Alert: ${alert.name}`;

  // Fallback text for notifications
  const fallbackText = `${headerText} - ${totalCertificates} certificate(s) expiring`;

  // Build header block
  const headerBlock: TSlackBlock = {
    type: "header",
    text: { type: "plain_text", text: headerText, emoji: true }
  };

  // Build certificate blocks
  const certificateBlocks: TSlackBlock[] = [];

  for (const cert of displayCertificates) {
    const notAfter = new Date(cert.notAfter);
    const daysUntilExpiry = Math.ceil((notAfter.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    certificateBlocks.push({
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Common Name:*\n${cert.commonName || "N/A"}` },
        { type: "mrkdwn", text: `*Serial:*\n\`${cert.serialNumber}\`` },
        {
          type: "mrkdwn",
          text: `*Expires:*\n${notAfter.toISOString().split("T")[0]}`
        },
        { type: "mrkdwn", text: `*Days Until Expiry:*\n${daysUntilExpiry}` }
      ]
    });

    // Add divider between certificates (but not after the last one)
    if (displayCertificates.indexOf(cert) < displayCertificates.length - 1) {
      certificateBlocks.push({ type: "divider" });
    }
  }

  // Build attachment blocks (colored sidebar)
  const attachmentBlocks: TSlackBlock[] = [
    // Alert info section
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Alert Name:*\n${alert.name}` },
        { type: "mrkdwn", text: `*Alert Before:*\n${alert.alertBefore}` }
      ]
    },
    { type: "divider" },
    // Summary section
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${totalCertificates}* certificate(s) expiring within *${alert.alertBefore}*`
      }
    },
    ...certificateBlocks
  ];

  // Add "more" indicator if there are additional certificates
  if (remainingCount > 0) {
    attachmentBlocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: `_+${remainingCount} more certificates..._` }]
    });
  }

  // Add action button
  attachmentBlocks.push({
    type: "actions",
    elements: [
      {
        type: "button",
        text: { type: "plain_text", text: "View in Infisical", emoji: true },
        url: viewUrl,
        style: "primary"
      }
    ]
  });

  return {
    text: fallbackText,
    blocks: [headerBlock],
    attachments: [
      {
        color: "#f0b429", // Warning yellow
        blocks: attachmentBlocks
      }
    ]
  };
};

const isSlackErrorRetryable = (err: AxiosError): boolean => {
  const status = err.response?.status;
  if (status && status >= 500) return true;
  if (err.code && RETRYABLE_NETWORK_ERRORS.includes(err.code)) return true;
  if (err.message?.toLowerCase().includes("timeout")) return true;
  return false;
};

const triggerSlackWebhook = async (url: string, payload: TSlackPayload): Promise<void> => {
  await request.post(url, payload, {
    headers: {
      "Content-Type": "application/json"
    },
    timeout: SLACK_WEBHOOK_TIMEOUT,
    signal: AbortSignal.timeout(SLACK_WEBHOOK_TIMEOUT)
  });
};

const triggerSlackWebhookWithRetry = async (url: string, payload: TSlackPayload): Promise<TChannelResult> => {
  const { maxRetries, delayMs } = PKI_ALERT_RETRY_CONFIG;
  let lastError: AxiosError | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await triggerSlackWebhook(url, payload);
      return { success: true };
    } catch (err) {
      lastError = err as AxiosError;

      if (!isSlackErrorRetryable(lastError)) {
        logger.info(
          { url: maskSlackWebhookUrl(url), statusCode: lastError.response?.status, error: lastError.message },
          "Slack webhook error is not retryable (4xx or non-transient error)"
        );
        return { success: false, error: lastError.message };
      }

      logger.info(
        {
          url: maskSlackWebhookUrl(url),
          attempt,
          maxRetries,
          statusCode: lastError.response?.status,
          error: lastError.message
        },
        `Slack webhook failed, ${attempt < maxRetries ? `retrying in ${delayMs}ms` : "no more retries"}`
      );

      if (attempt < maxRetries) {
        // eslint-disable-next-line no-await-in-loop
        await delay(delayMs);
      }
    }
  }

  return { success: false, error: lastError?.message };
};

/**
 * Sends a Slack notification with validation and retry logic.
 *
 * Steps:
 * 1. Validate the webhook URL (HTTPS, correct hostname, SSRF protection)
 * 2. Build the Slack Block Kit payload
 * 3. Send with exponential backoff retry on transient failures
 */
export const sendSlackNotificationWithRetry = async (
  config: TSlackChannelConfig,
  alertData: TAlertInfo,
  matchingCertificates: TCertificatePreview[]
): Promise<TChannelResult> => {
  await validateSlackWebhookUrl(config.webhookUrl);

  const appCfg = getConfig();
  const payload = buildSlackPayload({
    alert: alertData,
    certificates: matchingCertificates,
    appUrl: appCfg.SITE_URL
  });

  return triggerSlackWebhookWithRetry(config.webhookUrl, payload);
};
