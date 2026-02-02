import crypto from "node:crypto";

import { AxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { logger } from "@app/lib/logger";

import { TCertificatePreview } from "./pki-alert-v2-types";

const PKI_WEBHOOK_TIMEOUT = 2 * 1000;

export enum PkiWebhookEventType {
  CERTIFICATE_EXPIRATION = "com.infisical.pki.certificate.expiration",
  CERTIFICATE_TEST = "com.infisical.pki.certificate.test"
}

// Alert info used across event types
type TAlertInfo = {
  id: string;
  name: string;
  alertBefore: string;
  projectId: string;
};

// Certificate data for webhook payloads
type TCertificateData = {
  id: string;
  serialNumber: string;
  commonName: string;
  san: string[];
  profileName: string | null;
  notBefore: string;
  notAfter: string;
  status: string;
  daysUntilExpiry: number;
};

export type TPkiWebhookPayload = {
  // Required CloudEvents attributes
  specversion: "1.0";
  type: PkiWebhookEventType;
  source: string;
  id: string;

  // Optional CloudEvents attributes
  time: string;
  datacontenttype: "application/json";
  subject: string;

  // Event data
  data: {
    alert: TAlertInfo;
    certificates: TCertificateData[];
    metadata: {
      totalCertificates: number;
      viewUrl: string;
    };
  };
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
      viewUrl: `${params.appUrl}/cert-manager/${params.alert.projectId}/policies`
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
      viewUrl: `${params.appUrl}/cert-manager/${params.alert.projectId}/policies`
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

type TTriggerPkiWebhookParams = {
  url: string;
  payload: TPkiWebhookPayload;
  signingSecret?: string;
};

type TTriggerPkiWebhookResult = {
  success: boolean;
  statusCode?: number;
  error?: string;
};

export const triggerPkiWebhook = async ({
  url,
  payload,
  signingSecret
}: TTriggerPkiWebhookParams): Promise<TTriggerPkiWebhookResult> => {
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

  try {
    const response = await request.post(url, payload, {
      headers,
      timeout: PKI_WEBHOOK_TIMEOUT,
      signal: AbortSignal.timeout(PKI_WEBHOOK_TIMEOUT)
    });

    return { success: true, statusCode: response.status };
  } catch (err) {
    const error = err as AxiosError;
    logger.error(
      { url, alertId: payload.data.alert.id, error: error.message, statusCode: error.response?.status },
      "PKI webhook trigger failed"
    );
    return { success: false, statusCode: error.response?.status, error: error.message };
  }
};
