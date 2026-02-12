import { AxiosError } from "axios";

import { getConfig } from "@app/lib/config/env";
import { request } from "@app/lib/config/request";
import { delay } from "@app/lib/delay";
import { logger } from "@app/lib/logger";

import { PKI_ALERT_RETRY_CONFIG, RETRYABLE_NETWORK_ERRORS } from "./pki-alert-v2-constants";
import {
  pagerDutyIntegrationKeyRegex,
  TAlertInfo,
  TBuildPagerDutyPayloadParams,
  TCertificatePreview,
  TChannelResult,
  TPagerDutyChannelConfig,
  TPagerDutyPayload
} from "./pki-alert-v2-types";

const PAGERDUTY_EVENTS_URL = "https://events.pagerduty.com/v2/enqueue";
const PAGERDUTY_TIMEOUT = 7 * 1000;
const MAX_CERTIFICATES_IN_PAYLOAD = 10;

/**
 * Validates that the integration key is a valid 32-character hex string.
 */
export const validatePagerDutyIntegrationKey = (integrationKey: string): boolean => {
  return pagerDutyIntegrationKeyRegex.test(integrationKey);
};

/**
 * Determines PagerDuty severity based on the most urgent certificate's days until expiry.
 *
 * <=7 days  -> critical
 * <=14 days -> error
 * <=30 days -> warning
 * >30 days  -> info
 */
const getSeverity = (certificates: TCertificatePreview[]): "critical" | "error" | "warning" | "info" => {
  const now = new Date();
  let minDays = Infinity;

  for (const cert of certificates) {
    const notAfter = new Date(cert.notAfter);
    const daysUntilExpiry = Math.ceil((notAfter.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysUntilExpiry < minDays) {
      minDays = daysUntilExpiry;
    }
  }

  if (minDays <= 7) return "critical";
  if (minDays <= 14) return "error";
  if (minDays <= 30) return "warning";
  return "info";
};

/**
 * Builds a PagerDuty Events API v2 payload (PD-CEF format).
 *
 * - Uses alertId as dedup_key to group related events into the same incident
 * - Caps certificates at 10 to stay under the 512KB payload limit
 * - Severity is auto-mapped from the most urgent certificate
 */
export const buildPagerDutyPayload = ({
  alert,
  certificates,
  integrationKey,
  appUrl = "https://app.infisical.com"
}: TBuildPagerDutyPayloadParams): TPagerDutyPayload => {
  const now = new Date();
  const totalCertificates = certificates.length;
  const severity = getSeverity(certificates);

  const sortedCertificates = [...certificates].sort((a, b) => {
    const aExpiry = new Date(a.notAfter).getTime();
    const bExpiry = new Date(b.notAfter).getTime();
    return aExpiry - bExpiry;
  });

  const displayCertificates = sortedCertificates.slice(0, MAX_CERTIFICATES_IN_PAYLOAD);

  const viewUrl = `${appUrl}/projects/cert-manager/${alert.projectId}/policies`;

  return {
    routing_key: integrationKey,
    event_action: "trigger",
    dedup_key: alert.id,
    payload: {
      summary: `Infisical: ${totalCertificates} certificate(s) expiring within ${alert.alertBefore} - Alert: ${alert.name}`,
      severity,
      source: "infisical-pki-alerts",
      timestamp: now.toISOString(),
      component: "certificate-manager",
      group: alert.projectId,
      class: "certificate-expiration",
      custom_details: {
        alert_name: alert.name,
        alert_before: alert.alertBefore,
        total_certificates: totalCertificates,
        certificates: displayCertificates.map((cert) => {
          const notAfter = new Date(cert.notAfter);
          const daysUntilExpiry = Math.ceil((notAfter.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          return {
            common_name: cert.commonName || "N/A",
            serial_number: cert.serialNumber,
            expires_at: notAfter.toISOString(),
            days_until_expiry: daysUntilExpiry
          };
        }),
        view_url: viewUrl
      }
    },
    links: [{ href: viewUrl, text: "View certificates in Infisical" }]
  };
};

const isPagerDutyErrorRetryable = (err: AxiosError): boolean => {
  const status = err.response?.status;
  // 400 Bad Request is not retryable
  if (status === 400) return false;
  // 429 Rate Limit and 5xx are retryable
  if (status === 429) return true;
  if (status && status >= 500) return true;
  if (err.code && RETRYABLE_NETWORK_ERRORS.includes(err.code)) return true;
  if (err.message?.toLowerCase().includes("timeout")) return true;
  return false;
};

const triggerPagerDutyEvent = async (payload: TPagerDutyPayload): Promise<void> => {
  await request.post(PAGERDUTY_EVENTS_URL, payload, {
    headers: {
      "Content-Type": "application/json"
    },
    timeout: PAGERDUTY_TIMEOUT,
    signal: AbortSignal.timeout(PAGERDUTY_TIMEOUT)
  });
};

const triggerPagerDutyEventWithRetry = async (payload: TPagerDutyPayload): Promise<TChannelResult> => {
  const { maxRetries, delayMs } = PKI_ALERT_RETRY_CONFIG;
  let lastError: AxiosError | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await triggerPagerDutyEvent(payload);
      return { success: true };
    } catch (err) {
      lastError = err as AxiosError;

      if (!isPagerDutyErrorRetryable(lastError)) {
        logger.info(
          {
            statusCode: lastError.response?.status,
            error: lastError.message
          },
          "PagerDuty event error is not retryable (4xx or non-transient error)"
        );
        return { success: false, error: lastError.message };
      }

      logger.info(
        {
          attempt,
          maxRetries,
          statusCode: lastError.response?.status,
          error: lastError.message
        },
        `PagerDuty event failed, ${attempt < maxRetries ? `retrying in ${delayMs}ms` : "no more retries"}`
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
 * Sends a PagerDuty notification with validation and retry logic.
 *
 * Posts to the fixed PagerDuty Events API v2 endpoint.
 * No SSRF check needed since the endpoint is hardcoded.
 */
export const sendPagerDutyNotificationWithRetry = async (
  config: TPagerDutyChannelConfig,
  alertData: TAlertInfo,
  matchingCertificates: TCertificatePreview[]
): Promise<TChannelResult> => {
  if (!config.integrationKey || !validatePagerDutyIntegrationKey(config.integrationKey)) {
    return { success: false, error: "Invalid PagerDuty integration key" };
  }

  const appCfg = getConfig();
  const payload = buildPagerDutyPayload({
    alert: alertData,
    certificates: matchingCertificates,
    integrationKey: config.integrationKey,
    appUrl: appCfg.SITE_URL
  });

  return triggerPagerDutyEventWithRetry(payload);
};
