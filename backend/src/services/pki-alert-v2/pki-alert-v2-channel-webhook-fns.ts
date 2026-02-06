import crypto from "node:crypto";

import { AxiosError } from "axios";

import { getConfig } from "@app/lib/config/env";
import { request } from "@app/lib/config/request";
import { delay } from "@app/lib/delay";
import { logger } from "@app/lib/logger";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator/validate-url";

import { PKI_ALERT_RETRY_CONFIG, RETRYABLE_NETWORK_ERRORS } from "./pki-alert-v2-constants";
import {
  PkiWebhookEventType,
  TAlertInfo,
  TCertificateData,
  TCertificatePreview,
  TChannelResult,
  TPkiWebhookPayload,
  TWebhookChannelConfig
} from "./pki-alert-v2-types";

const PKI_WEBHOOK_TIMEOUT = 7 * 1000;

const isWebhookErrorRetryable = (err: AxiosError): boolean => {
  const status = err.response?.status;
  if (status && status >= 500) return true;
  if (err.code && RETRYABLE_NETWORK_ERRORS.includes(err.code)) return true;
  if (err.message?.toLowerCase().includes("timeout")) return true;
  return false;
};

// Base CloudEvents envelope fields
type TPkiWebhookBase = Pick<TPkiWebhookPayload, "specversion" | "type" | "source" | "id" | "time" | "datacontenttype">;

// Event-specific payload structure (reuses TPkiWebhookPayload fields for type safety)
type TBaseEventPayload = Pick<TPkiWebhookPayload, "subject" | "data">;

type TBuildWebhookPayloadParams = {
  alert: TAlertInfo;
  certificates: TCertificatePreview[];
  eventType: PkiWebhookEventType;
  appUrl?: string;
};

// Builds CloudEvents envelope (shared across all events)
const buildBasePayload = (params: {
  eventType: PkiWebhookEventType;
  projectId: string;
  alertId: string;
}): TPkiWebhookBase => ({
  specversion: "1.0" as const,
  type: params.eventType,
  source: `/projects/${params.projectId}/alerts/${params.alertId}`,
  id: crypto.randomUUID(),
  time: new Date().toISOString(),
  datacontenttype: "application/json" as const
});

// Transforms certificate previews to webhook payload format
const transformCertificates = (certificates: TCertificatePreview[]): TCertificateData[] => {
  const now = new Date();

  return certificates.map((cert) => {
    const notAfter = new Date(cert.notAfter);
    const daysUntilExpiry = Math.ceil((notAfter.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    return {
      id: cert.id,
      serialNumber: cert.serialNumber,
      commonName: cert.commonName,
      san: cert.san,
      profileName: cert.profileName,
      notBefore: cert.notBefore.toISOString(),
      notAfter: cert.notAfter.toISOString(),
      status: cert.status,
      daysUntilExpiry
    };
  });
};

// Event-specific data builders
const buildCertificateExpirationEventData = (params: {
  alert: TAlertInfo;
  certificates: TCertificatePreview[];
  appUrl: string;
}): TBaseEventPayload => ({
  subject: "certificate-expiration-alert",
  data: {
    alert: {
      id: params.alert.id,
      name: params.alert.name,
      alertBefore: params.alert.alertBefore,
      projectId: params.alert.projectId
    },
    certificates: transformCertificates(params.certificates),
    metadata: {
      totalCertificates: params.certificates.length,
      viewUrl: `${params.appUrl}/projects/cert-manager/${params.alert.projectId}/policies`
    }
  }
});

const buildCertificateTestEventData = (params: {
  alert: TAlertInfo;
  certificates: TCertificatePreview[];
  appUrl: string;
}): TBaseEventPayload => ({
  subject: "certificate-test",
  data: {
    alert: {
      id: params.alert.id,
      name: params.alert.name,
      alertBefore: params.alert.alertBefore,
      projectId: params.alert.projectId
    },
    certificates: transformCertificates(params.certificates),
    metadata: {
      totalCertificates: params.certificates.length,
      viewUrl: `${params.appUrl}/projects/cert-manager/${params.alert.projectId}/policies`
    }
  }
});

export const buildWebhookPayload = ({
  alert,
  certificates,
  eventType,
  appUrl = "https://app.infisical.com"
}: TBuildWebhookPayloadParams): TPkiWebhookPayload => {
  const base = buildBasePayload({
    eventType,
    projectId: alert.projectId,
    alertId: alert.id
  });

  const eventParams = { alert, certificates, appUrl };

  const eventData = (() => {
    switch (eventType) {
      case PkiWebhookEventType.CERTIFICATE_EXPIRATION:
        return buildCertificateExpirationEventData(eventParams);
      case PkiWebhookEventType.CERTIFICATE_TEST:
        return buildCertificateTestEventData(eventParams);
      default:
        throw new Error(`Unknown PKI webhook event type: ${eventType as string}`);
    }
  })();

  return { ...base, ...eventData };
};

const generateHmacSignature = (payload: string, secret: string): string => {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
};

const triggerPkiWebhook = async (params: {
  url: string;
  payload: TPkiWebhookPayload;
  signingSecret?: string;
}): Promise<void> => {
  const { url, payload, signingSecret } = params;
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };

  const payloadString = JSON.stringify(payload);
  const timestamp = Date.now();

  if (signingSecret) {
    const signaturePayload = `${timestamp}.${payloadString}`;
    const signature = generateHmacSignature(signaturePayload, signingSecret);
    headers["x-infisical-signature"] = `t=${timestamp},v1=${signature}`;
  }

  await request.post(url, payload, {
    headers,
    timeout: PKI_WEBHOOK_TIMEOUT,
    signal: AbortSignal.timeout(PKI_WEBHOOK_TIMEOUT)
  });
};

const triggerPkiWebhookWithRetry = async (params: {
  url: string;
  payload: TPkiWebhookPayload;
  signingSecret?: string;
}): Promise<TChannelResult> => {
  const { maxRetries, delayMs } = PKI_ALERT_RETRY_CONFIG;
  let lastError: AxiosError | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await triggerPkiWebhook(params);
      return { success: true };
    } catch (err) {
      lastError = err as AxiosError;

      if (!isWebhookErrorRetryable(lastError)) {
        logger.info(
          { url: params.url, statusCode: lastError.response?.status, error: lastError.message },
          "PKI webhook error is not retryable (4xx or non-transient error)"
        );
        return { success: false, error: lastError.message };
      }

      logger.info(
        { url: params.url, attempt, maxRetries, statusCode: lastError.response?.status, error: lastError.message },
        `PKI webhook failed, ${attempt < maxRetries ? `retrying in ${delayMs}ms` : "no more retries"}`
      );

      if (attempt < maxRetries) {
        // eslint-disable-next-line no-await-in-loop
        await delay(delayMs);
      }
    }
  }

  return { success: false, error: lastError?.message };
};

export const sendWebhookNotification = async (
  config: TWebhookChannelConfig,
  alertData: TAlertInfo,
  matchingCertificates: TCertificatePreview[],
  eventType: PkiWebhookEventType
): Promise<TChannelResult> => {
  await blockLocalAndPrivateIpAddresses(config.url);

  const appCfg = getConfig();
  const payload = buildWebhookPayload({
    alert: alertData,
    certificates: matchingCertificates,
    eventType,
    appUrl: appCfg.SITE_URL
  });

  return triggerPkiWebhookWithRetry({
    url: config.url,
    payload,
    signingSecret: config.signingSecret ?? undefined
  });
};
