import { logger } from "@app/lib/logger";

import { InAppChannelConfigSchema, TAlarmChannelSendContext, TChannelResult } from "../alarm-channel-types";

export const sendInAppNotification = async (ctx: TAlarmChannelSendContext): Promise<TChannelResult> => {
  InAppChannelConfigSchema.parse(ctx.config);

  if (!ctx.recipient?.userId) {
    return { success: true };
  }
  if (!ctx.payload.notificationType) {
    return { success: false, error: "Missing notificationType for in-app channel" };
  }

  try {
    await ctx.deps.notificationService.createUserNotifications([
      {
        userId: ctx.recipient.userId,
        orgId: ctx.payload.alarm.orgId,
        type: ctx.payload.notificationType,
        title: `${ctx.payload.resourceKind} ${ctx.payload.eventLabel}: ${ctx.payload.alarm.name}`,
        body: ctx.payload.summary,
        link: ctx.payload.alarm.viewUrl
      }
    ]);
    return { success: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Unknown error";
    logger.error(err, `Alarm in-app notification failed [channelId=${ctx.channelId}]`);
    return { success: false, error };
  }
};
