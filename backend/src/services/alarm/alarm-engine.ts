import { OrgMembershipRole, OrgMembershipStatus, TAlarms } from "@app/db/schemas";
import { logger } from "@app/lib/logger";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TNotificationServiceFactory } from "@app/services/notification/notification-service";
import { NotificationType } from "@app/services/notification/notification-types";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TSmtpService } from "@app/services/smtp/smtp-service";

import { decryptChannelConfig, getAlarmChannelCipher } from "./alarm-channel-crypto-fns";
import { TAlarmChannelDALFactory } from "./alarm-channel-dal";
import { AlarmChannelType, TAlarmChannelDeps, TAlarmRecipient } from "./alarm-channel-types";
import { TAlarmHistoryDALFactory } from "./alarm-history-dal";
import { TAlarmProviderRegistry } from "./alarm-provider-registry";
import { TAlarmRecipientDALFactory } from "./alarm-recipient-dal";
import { TAlarmRecipientResolver } from "./alarm-recipient-resolver";
import { AlarmRunStatus, DEFAULT_DEDUP_WINDOW_HOURS, TAlarmContext } from "./alarm-types";
import { ALARM_CHANNEL_REGISTRY } from "./channels/alarm-channel-registry";

const FAILURE_NOTIFICATION_MAX_ERROR_LENGTH = 200;

export type TAlarmEngineDep = {
  alarmChannelDAL: Pick<TAlarmChannelDALFactory, "findByAlarmId">;
  alarmRecipientDAL: Pick<TAlarmRecipientDALFactory, "findByAlarmId">;
  alarmHistoryDAL: Pick<TAlarmHistoryDALFactory, "createWithTargets" | "findRecentlyAlarmedTargets">;
  alarmProviderRegistry: TAlarmProviderRegistry;
  alarmRecipientResolver: TAlarmRecipientResolver;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  orgDAL: Pick<TOrgDALFactory, "findOrgMembersByRole">;
  notificationService: Pick<TNotificationServiceFactory, "createUserNotifications">;
  smtpService: Pick<TSmtpService, "sendMail">;
};

export type TAlarmEngine = ReturnType<typeof alarmEngineFactory>;

export const alarmEngineFactory = ({
  alarmChannelDAL,
  alarmRecipientDAL,
  alarmHistoryDAL,
  alarmProviderRegistry,
  alarmRecipientResolver,
  kmsService,
  orgDAL,
  notificationService,
  smtpService
}: TAlarmEngineDep) => {
  const notifyAdminsOfFailure = async (alarm: TAlarms, viewUrl: string, error: string) => {
    try {
      const admins = (await orgDAL.findOrgMembersByRole(alarm.orgId, OrgMembershipRole.Admin)).filter(
        (admin) => admin.status !== OrgMembershipStatus.Invited && admin.user?.id
      );
      if (admins.length === 0) return;

      const truncatedError =
        error.length > FAILURE_NOTIFICATION_MAX_ERROR_LENGTH
          ? `${error.substring(0, FAILURE_NOTIFICATION_MAX_ERROR_LENGTH)}...`
          : error;

      await notificationService.createUserNotifications(
        admins.map((admin) => ({
          userId: admin.user.id,
          orgId: alarm.orgId,
          type: NotificationType.ALARM_CHANNEL_FAILED,
          title: `Alarm Channel Failed: ${alarm.name}`,
          body: `Your alarm **${alarm.name}** failed to deliver on one or more channels: \`${truncatedError}\``,
          link: viewUrl
        }))
      );
    } catch (err) {
      logger.error(err, `Failed to notify admins of alarm channel failure [alarmId=${alarm.id}]`);
    }
  };

  const runAlarm = async (alarm: TAlarms) => {
    const provider = alarmProviderRegistry.get(alarm.resourceType);
    if (!provider) {
      logger.warn(`No alarm provider registered for resource type '${alarm.resourceType}' [alarmId=${alarm.id}]`);
      return;
    }

    const targets = await provider.findDueTargets({
      orgId: alarm.orgId,
      projectId: alarm.projectId,
      resourceId: alarm.resourceId,
      eventType: alarm.eventType,
      condition: alarm.condition,
      filters: alarm.filters
    });
    if (targets.length === 0) return;

    const window = provider.dedupWindowHours?.(alarm.condition) ?? DEFAULT_DEDUP_WINDOW_HOURS;
    const candidateIds = targets.map((target) => provider.targetId(target));
    const recentlyAlarmed = new Set(await alarmHistoryDAL.findRecentlyAlarmedTargets(alarm.id, candidateIds, window));
    const dueTargets = targets.filter((target) => !recentlyAlarmed.has(provider.targetId(target)));
    if (dueTargets.length === 0) return;

    const channels = (await alarmChannelDAL.findByAlarmId(alarm.id)).filter((channel) => channel.enabled);
    if (channels.length === 0) return;

    const alarmContext: TAlarmContext = {
      id: alarm.id,
      name: alarm.name,
      orgId: alarm.orgId,
      projectId: alarm.projectId,
      resourceType: alarm.resourceType,
      resourceId: alarm.resourceId,
      eventType: alarm.eventType,
      condition: alarm.condition,
      filters: alarm.filters
    };
    const payload = provider.buildPayload(alarmContext, dueTargets);

    const { decryptor } = await getAlarmChannelCipher(kmsService, {
      orgId: alarm.orgId,
      projectId: alarm.projectId
    });

    const hasDirectedChannel = channels.some(
      (channel) => ALARM_CHANNEL_REGISTRY[channel.channelType as AlarmChannelType]?.directed
    );
    let recipients: TAlarmRecipient[] = [];
    if (hasDirectedChannel) {
      recipients = await alarmRecipientResolver.resolve(await alarmRecipientDAL.findByAlarmId(alarm.id));
    }

    const deps: TAlarmChannelDeps = { smtpService };

    const channelResults = await Promise.all(
      channels.map(async (channel) => {
        const definition = ALARM_CHANNEL_REGISTRY[channel.channelType as AlarmChannelType];
        if (!definition) return { channelType: channel.channelType, success: false, error: "Unknown channel type" };

        let config: unknown;
        try {
          config = decryptChannelConfig(channel.encryptedConfig, decryptor);
        } catch (err) {
          logger.error(err, `Failed to decrypt alarm channel config [channelId=${channel.id}]`);
          return { channelType: channel.channelType, success: false, error: "Failed to decrypt channel config" };
        }

        try {
          if (definition.directed) {
            const deliveries = recipients.length > 0 ? recipients : [undefined];
            const results = await Promise.all(
              deliveries.map((recipient) =>
                definition.send({ channelId: channel.id, config, payload, recipient, deps })
              )
            );
            const failures = results.filter((result) => !result.success);
            if (failures.length > 0) {
              return {
                channelType: channel.channelType,
                success: false,
                error: failures.map((f) => f.error).join("; ")
              };
            }
            return { channelType: channel.channelType, success: true };
          }

          const result = await definition.send({ channelId: channel.id, config, payload, deps });
          return { channelType: channel.channelType, ...result };
        } catch (err) {
          const error = err instanceof Error ? err.message : "Unknown error";
          logger.error(err, `Failed to dispatch alarm ${channel.channelType} channel [alarmId=${alarm.id}]`);
          return { channelType: channel.channelType, success: false, error };
        }
      })
    );

    const errors = channelResults
      .filter((result) => !result.success && result.error)
      .map((result) => `${result.channelType}: ${result.error}`);
    const status = errors.length > 0 ? AlarmRunStatus.FAILED : AlarmRunStatus.SUCCESS;
    const errorText = errors.length > 0 ? errors.join("\n") : undefined;

    if (errorText) {
      await notifyAdminsOfFailure(alarm, payload.alarm.viewUrl, errorText);
    }

    await alarmHistoryDAL.createWithTargets(
      alarm.id,
      dueTargets.map((target) => provider.targetId(target)),
      { status, error: errorText }
    );
  };

  return { runAlarm };
};
