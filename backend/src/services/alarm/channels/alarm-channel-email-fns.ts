import { delay } from "@app/lib/delay";
import { logger } from "@app/lib/logger";
import { SmtpTemplates } from "@app/services/smtp/smtp-service";

import { ALARM_CHANNEL_RETRY_CONFIG, RETRYABLE_NETWORK_ERRORS } from "../alarm-channel-constants";
import {
  EmailChannelConfigSchema,
  TAlarmChannelSendContext,
  TAlarmPayload,
  TChannelResult
} from "../alarm-channel-types";

const isEmailErrorRetryable = (err: Error): boolean => {
  const msg = err.message.toLowerCase();
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

  const { maxRetries, delayMs } = ALARM_CHANNEL_RETRY_CONFIG;
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await sendEmail(ctx.deps.smtpService, recipients, ctx.payload);
      return { success: true };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (!isEmailErrorRetryable(lastError)) {
        logger.info(
          { channelId: ctx.channelId, error: lastError.message },
          `Alarm email error is not retryable (permanent SMTP error) [channelId=${ctx.channelId}]`
        );
        return { success: false, error: lastError.message };
      }

      logger.info(
        { channelId: ctx.channelId, attempt, maxRetries, error: lastError.message },
        `Alarm email failed, ${attempt < maxRetries ? `retrying in ${delayMs}ms` : "no more retries"} [channelId=${ctx.channelId}]`
      );

      if (attempt < maxRetries) {
        // eslint-disable-next-line no-await-in-loop
        await delay(delayMs);
      }
    }
  }

  return { success: false, error: lastError?.message };
};
