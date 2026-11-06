import crypto from "node:crypto";

import { z } from "zod";

import { BadRequestError } from "@app/lib/errors";
import { safeRequest } from "@app/lib/validator";

import {
  ALERT_CHANNEL_HTTP_TIMEOUT,
  TAlertChannelSendContext,
  TAlertPayload,
  TChannelResult,
  WEBHOOK_AUTH_SECRET_FIELD_BY_TYPE,
  WebhookAuthType,
  WebhookChannelConfigSchema
} from "../alert-channel-types";

type TWebhookChannelConfig = z.infer<typeof WebhookChannelConfigSchema>;

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

const normalizeUrl = (url: unknown): string | null => {
  if (typeof url !== "string") return null;
  try {
    return new URL(url).href;
  } catch {
    return null;
  }
};

export const assertWebhookUrlUnchangedForKeptCredentials = (
  incomingConfig: Record<string, unknown>,
  storedConfig: Record<string, unknown>
) => {
  const secretField = WEBHOOK_AUTH_SECRET_FIELD_BY_TYPE[incomingConfig.authType as WebhookAuthType];
  if (!secretField || incomingConfig[secretField] || storedConfig[secretField] == null) return;

  const incomingUrl = normalizeUrl(incomingConfig.url);
  if (incomingUrl === null || incomingUrl === normalizeUrl(storedConfig.url)) return;

  throw new BadRequestError({
    message:
      "Enter the authentication credentials again because the webhook URL changed. Saved credentials are only sent to the URL they were saved with"
  });
};

const buildAuthHeaders = (config: TWebhookChannelConfig): Record<string, string> => {
  switch (config.authType) {
    case WebhookAuthType.BEARER:
      return { Authorization: `Bearer ${config.authCredentials}` };
    case WebhookAuthType.BASIC:
      return {
        Authorization: `Basic ${Buffer.from(`${config.basicUsername}:${config.basicPassword}`).toString("base64")}`
      };
    case WebhookAuthType.HEADER:
      return config.authHeaderName ? { [config.authHeaderName]: config.authHeaderValue ?? "" } : {};
    default:
      return {};
  }
};

const generateHmacSignature = (data: string, secret: string): string =>
  crypto.createHmac("sha256", secret).update(data).digest("hex");

const triggerWebhook = async (config: TWebhookChannelConfig, payload: TAlertWebhookPayload): Promise<void> => {
  const { url, signingSecret } = config;
  const headers: Record<string, string> = {
    ...Object.fromEntries((config.headers ?? []).map(({ key, value }) => [key, value])),
    ...buildAuthHeaders(config),
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

  await triggerWebhook(config, payload);
  return { success: true };
};
