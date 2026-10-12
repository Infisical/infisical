import crypto from "node:crypto";

import { safeRequest } from "@app/lib/validator";

import {
  ALERT_CHANNEL_HTTP_TIMEOUT,
  ALERT_CHANNEL_REDACTED_VALUE,
  TAlertChannelSendContext,
  TAlertPayload,
  TChannelResult,
  TWebhookChannelHeader,
  WebhookChannelConfigSchema
} from "../alert-channel-types";

type TAlertWebhookPayload = {
  specversion: "1.0";
  type: string;
  source: string;
  id: string;
  time: string;
  datacontenttype: "application/json";
  subject: string;
  data: {
    alert: { id: string; name: string; resourceType: string; resourceId?: string; condition?: string };
    items: TAlertPayload["items"];
    metadata: { totalItems: number; viewUrl: string };
  };
};

export const buildWebhookPayload = (payload: TAlertPayload): TAlertWebhookPayload => ({
  specversion: "1.0",
  type: payload.webhookType,
  source:
    payload.webhookSource ??
    (payload.alert.projectId
      ? `/projects/${payload.alert.projectId}/alerts/${payload.alert.id}`
      : `/alerts/${payload.alert.id}`),
  id: crypto.randomUUID(),
  time: new Date().toISOString(),
  datacontenttype: "application/json",
  subject: payload.eventKey,
  data: {
    alert: {
      id: payload.alert.id,
      name: payload.alert.name,
      resourceType: payload.alert.resourceType,
      ...(payload.alert.resourceId ? { resourceId: payload.alert.resourceId } : {}),
      ...(payload.alert.condition ? { condition: payload.alert.condition } : {})
    },
    items: payload.items,
    metadata: {
      totalItems: payload.items.length,
      viewUrl: payload.alert.viewUrl
    }
  }
});

// Header lists arrive unvalidated on the update path, so only well-formed entries are looked at.
const isWebhookHeader = (header: unknown): header is TWebhookChannelHeader =>
  typeof header === "object" &&
  header !== null &&
  typeof (header as TWebhookChannelHeader).key === "string" &&
  typeof (header as TWebhookChannelHeader).value === "string";

export const redactWebhookHeaders = (config: Record<string, unknown>): Record<string, unknown> => {
  if (!Array.isArray(config.headers)) return config;
  return {
    ...config,
    headers: config.headers.map((header: unknown) =>
      isWebhookHeader(header) ? { key: header.key, value: ALERT_CHANNEL_REDACTED_VALUE } : header
    )
  };
};

export const restoreRedactedWebhookHeaders = (
  incomingConfig: Record<string, unknown>,
  storedConfig: Record<string, unknown>
): Record<string, unknown> => {
  if (!Array.isArray(incomingConfig.headers)) return incomingConfig;

  const storedValues = new Map<string, string>();
  if (Array.isArray(storedConfig.headers)) {
    storedConfig.headers.forEach((header: unknown) => {
      if (isWebhookHeader(header)) storedValues.set(header.key.toLowerCase(), header.value);
    });
  }

  return {
    ...incomingConfig,
    headers: incomingConfig.headers.map((header: unknown) => {
      if (!isWebhookHeader(header) || header.value !== ALERT_CHANNEL_REDACTED_VALUE) return header;
      const storedValue = storedValues.get(header.key.trim().toLowerCase());
      return storedValue === undefined ? header : { ...header, value: storedValue };
    })
  };
};

const generateHmacSignature = (data: string, secret: string): string =>
  crypto.createHmac("sha256", secret).update(data).digest("hex");

const triggerWebhook = async (params: {
  url: string;
  payload: TAlertWebhookPayload;
  signingSecret?: string | null;
  customHeaders?: TWebhookChannelHeader[];
}): Promise<void> => {
  const { url, payload, signingSecret, customHeaders } = params;
  const headers: Record<string, string> = {
    ...Object.fromEntries((customHeaders ?? []).map(({ key, value }) => [key, value])),
    "Content-Type": "application/json"
  };

  if (signingSecret) {
    const payloadString = JSON.stringify(payload);
    const timestamp = Date.now();
    const signature = generateHmacSignature(`${timestamp}.${payloadString}`, signingSecret);
    headers["x-infisical-signature"] = `t=${timestamp},v1=${signature}`;
  }

  await safeRequest.post(url, payload, {
    headers,
    timeout: ALERT_CHANNEL_HTTP_TIMEOUT,
    signal: AbortSignal.timeout(ALERT_CHANNEL_HTTP_TIMEOUT)
  });
};

export const sendWebhookNotification = async (ctx: TAlertChannelSendContext): Promise<TChannelResult> => {
  const config = WebhookChannelConfigSchema.parse(ctx.config);
  const payload = buildWebhookPayload(ctx.payload);

  await triggerWebhook({
    url: config.url,
    payload,
    signingSecret: config.signingSecret,
    customHeaders: config.headers
  });
  return { success: true };
};
