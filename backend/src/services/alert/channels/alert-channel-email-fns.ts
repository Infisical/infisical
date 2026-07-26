import { logger } from "@app/lib/logger";
import { SmtpTemplates } from "@app/services/smtp/smtp-service";

import {
  EmailChannelConfigSchema,
  TAlertChannelSendContext,
  TAlertPayload,
  TChannelResult
} from "../alert-channel-types";

const buildSubstitutions = (payload: TAlertPayload) => ({
  alertName: payload.alert.name,
  eventLabel: payload.eventLabel,
  resourceKind: payload.resourceKind,
  summary: payload.summary,
  severity: payload.severity,
  viewUrl: payload.alert.viewUrl,
  items: payload.items.map((item) => ({
    title: item.title,
    identifier: item.identifier,
    fields: item.fields ?? []
  }))
});

const sendEmail = async (
  smtpService: TAlertChannelSendContext["deps"]["smtpService"],
  recipient: string,
  payload: TAlertPayload
): Promise<void> => {
  await smtpService.sendMail({
    recipients: [recipient],
    subjectLine: `Infisical ${payload.resourceKind} ${payload.eventLabel} Alert`,
    substitutions: buildSubstitutions(payload),
    template: SmtpTemplates.AlertNotification
  });
};

export const sendEmailNotification = async (ctx: TAlertChannelSendContext): Promise<TChannelResult> => {
  EmailChannelConfigSchema.parse(ctx.config);

  const recipient = ctx.recipient?.email;
  if (!recipient) {
    return { success: false, error: "No recipient for email channel" };
  }

  try {
    await sendEmail(ctx.deps.smtpService, recipient, ctx.payload);
    return { success: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.info({ channelId: ctx.channelId, error }, `Alert email delivery failed [channelId=${ctx.channelId}]`);
    return { success: false, error };
  }
};
