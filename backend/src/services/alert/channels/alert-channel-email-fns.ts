import { SmtpTemplates } from "@app/services/smtp/smtp-service";

import { RETRYABLE_NETWORK_ERRORS } from "../alert-channel-constants";
import {
  EmailChannelConfigSchema,
  TAlertChannelSendContext,
  TAlertPayload,
  TChannelResult
} from "../alert-channel-types";
import { retryWithBackoff } from "./alert-channel-retry-fns";

const isEmailErrorRetryable = (err: unknown): boolean => {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (RETRYABLE_NETWORK_ERRORS.some((code) => msg.includes(code.toLowerCase()))) return true;
  if (msg.includes("timeout") || msg.includes("connection")) return true;
  if (["421", "450", "451", "452"].some((code) => msg.includes(code))) return true;
  return false;
};

const buildSubstitutions = (payload: TAlertPayload) => ({
  alertName: payload.alert.name,
  eventLabel: payload.eventLabel,
  resourceKind: payload.resourceKind,
  summary: payload.summary,
  severity: payload.severity,
  condition: payload.alert.condition,
  viewUrl: payload.alert.viewUrl,
  items: payload.items.map((item) => ({
    title: item.title,
    identifier: item.identifier,
    fields: item.fields ?? []
  }))
});

const sendEmail = async (
  smtpService: TAlertChannelSendContext["deps"]["smtpService"],
  recipients: string[],
  payload: TAlertPayload
): Promise<void> => {
  await smtpService.sendMail({
    recipients,
    subjectLine: `Infisical ${payload.resourceKind} ${payload.eventLabel} Alert`,
    substitutions: buildSubstitutions(payload),
    template: SmtpTemplates.AlertNotification
  });
};

export const sendEmailNotification = async (ctx: TAlertChannelSendContext): Promise<TChannelResult> => {
  EmailChannelConfigSchema.parse(ctx.config);

  if (!ctx.recipient?.email) {
    return { success: false, error: "No recipient for email channel" };
  }
  const recipients = [ctx.recipient.email];

  return retryWithBackoff(() => sendEmail(ctx.deps.smtpService, recipients, ctx.payload), isEmailErrorRetryable, {
    channelId: ctx.channelId,
    channelLabel: "email"
  });
};
