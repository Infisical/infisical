import { SmtpTemplates } from "@app/services/smtp/smtp-service";

import { RETRYABLE_NETWORK_ERRORS } from "../alarm-channel-constants";
import {
  EmailChannelConfigSchema,
  TAlarmChannelSendContext,
  TAlarmPayload,
  TChannelResult
} from "../alarm-channel-types";
import { retryWithBackoff } from "./alarm-channel-retry-fns";

const isEmailErrorRetryable = (err: unknown): boolean => {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (RETRYABLE_NETWORK_ERRORS.some((code) => msg.includes(code.toLowerCase()))) return true;
  if (msg.includes("timeout") || msg.includes("connection")) return true;
  if (["421", "450", "451", "452"].some((code) => msg.includes(code))) return true;
  return false;
};

const buildSubstitutions = (payload: TAlarmPayload) => ({
  alarmName: payload.alarm.name,
  eventLabel: payload.eventLabel,
  resourceKind: payload.resourceKind,
  summary: payload.summary,
  condition: payload.alarm.condition,
  viewUrl: payload.alarm.viewUrl,
  items: payload.items.map((item) => ({
    title: item.title,
    identifier: item.identifier,
    fields: item.fields ?? []
  }))
});

const sendEmail = async (
  smtpService: TAlarmChannelSendContext["deps"]["smtpService"],
  recipients: string[],
  payload: TAlarmPayload
): Promise<void> => {
  await smtpService.sendMail({
    recipients,
    subjectLine: `Infisical ${payload.resourceKind} ${payload.eventLabel} Alert - ${payload.alarm.name}`,
    substitutions: buildSubstitutions(payload),
    template: SmtpTemplates.AlarmNotification
  });
};

export const sendEmailNotification = async (ctx: TAlarmChannelSendContext): Promise<TChannelResult> => {
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
