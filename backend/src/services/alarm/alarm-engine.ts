import { OrgMembershipRole, OrgMembershipStatus, TAlarms } from "@app/db/schemas";
import { logger } from "@app/lib/logger";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TNotificationServiceFactory } from "@app/services/notification/notification-service";
import { NotificationType } from "@app/services/notification/notification-types";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TSmtpService } from "@app/services/smtp/smtp-service";

import { decryptChannelConfig, getAlarmChannelCipher } from "./alarm-channel-crypto-fns";
import { TAlarmChannelDALFactory } from "./alarm-channel-dal";
import { TAlarmChannelRecipientDALFactory } from "./alarm-channel-recipient-dal";
import { AlarmChannelType, TAlarmChannelDeps, TAlarmRecipient } from "./alarm-channel-types";
import { TAlarmHistoryDALFactory } from "./alarm-history-dal";
import { TAlarmProviderRegistry } from "./alarm-provider-registry";
import { TAlarmRecipientResolver } from "./alarm-recipient-resolver";
import { AlarmRunStatus, DEFAULT_DEDUP_WINDOW_HOURS, TAlarmContext } from "./alarm-types";
import { ALARM_CHANNEL_REGISTRY } from "./channels/alarm-channel-registry";

const FAILURE_NOTIFICATION_MAX_ERROR_LENGTH = 200;

export type TAlarmEngineDep = {
  alarmChannelDAL: Pick<TAlarmChannelDALFactory, "findByAlarmId">;
  alarmChannelRecipientDAL: Pick<TAlarmChannelRecipientDALFactory, "findByChannelIds">;
  alarmHistoryDAL: Pick<TAlarmHistoryDALFactory, "createWithTargets" | "findRecentlyAlarmedTargets">;
  alarmProviderRegistry: TAlarmProviderRegistry;
  alarmRecipientResolver: Pick<TAlarmRecipientResolver, "resolveMany">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  orgDAL: Pick<TOrgDALFactory, "findOrgMembersByRole">;
  notificationService: Pick<TNotificationServiceFactory, "createUserNotifications">;
  smtpService: Pick<TSmtpService, "sendMail">;
};

export type TAlarmEngine = ReturnType<typeof alarmEngineFactory>;

export const alarmEngineFactory = ({
  alarmChannelDAL,
  alarmChannelRecipientDAL,
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

    const channels = (await alarmChannelDAL.findByAlarmId(alarm.id)).filter((channel) => channel.enabled);
    if (channels.length === 0) return;

    const window = provider.dedupWindowHours?.(alarm.condition) ?? DEFAULT_DEDUP_WINDOW_HOURS;
    const candidateIds = targets.map((target) => provider.targetId(target));
    const recentlyAlarmed = await alarmHistoryDAL.findRecentlyAlarmedTargets(alarm.id, candidateIds, window);
    const alarmedSet = new Set(recentlyAlarmed.map((row) => `${row.channelId}:${row.targetId}`));

    const channelWork = channels
      .map((channel) => {
        const definition = ALARM_CHANNEL_REGISTRY[channel.channelType as AlarmChannelType];
        const dueTargets = targets.filter((target) => !alarmedSet.has(`${channel.id}:${provider.targetId(target)}`));
        const cap = definition?.maxTargetsPerRun;
        if (cap && dueTargets.length > cap) {
          logger.info(
            `Alarm ${channel.channelType} channel capped at ${cap} targets this run; ${dueTargets.length - cap} deferred to the next run [alarmId=${alarm.id}] [channelId=${channel.id}]`
          );
          return { channel, dueTargets: dueTargets.slice(0, cap) };
        }
        return { channel, dueTargets };
      })
      .filter((work) => work.dueTargets.length > 0);
    if (channelWork.length === 0) return;

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
    const viewUrl = await provider.buildViewUrl(alarmContext);

    const { decryptor } = await getAlarmChannelCipher(kmsService, {
      orgId: alarm.orgId,
      projectId: alarm.projectId
    });

    const directedChannelIds = channelWork
      .filter((work) => ALARM_CHANNEL_REGISTRY[work.channel.channelType as AlarmChannelType]?.directed)
      .map((work) => work.channel.id);
    let recipientsByChannel = new Map<string, TAlarmRecipient[]>();
    if (directedChannelIds.length) {
      const recipientRows = await alarmChannelRecipientDAL.findByChannelIds(directedChannelIds);
      const rowsByChannel = new Map<string, { principalType: string; principalId: string }[]>();
      recipientRows.forEach((row) => {
        const list = rowsByChannel.get(row.channelId) ?? [];
        list.push(row);
        rowsByChannel.set(row.channelId, list);
      });
      recipientsByChannel = await alarmRecipientResolver.resolveMany(rowsByChannel);
    }

    const deps: TAlarmChannelDeps = { smtpService };

    const channelResults = await Promise.all(
      channelWork.map(async ({ channel, dueTargets }) => {
        const targetIds = dueTargets.map((target) => provider.targetId(target));
        const base = { channelId: channel.id, channelType: channel.channelType, targetIds };
        const definition = ALARM_CHANNEL_REGISTRY[channel.channelType as AlarmChannelType];
        if (!definition) return { ...base, success: false, error: "Unknown channel type" };

        let config: unknown;
        try {
          config = decryptChannelConfig(channel.encryptedConfig, decryptor);
        } catch (err) {
          logger.error(err, `Failed to decrypt alarm channel config [channelId=${channel.id}]`);
          return { ...base, success: false, error: "Failed to decrypt channel config" };
        }

        const payload = provider.buildPayload(alarmContext, dueTargets, viewUrl);

        try {
          if (definition.directed) {
            const recipients = recipientsByChannel.get(channel.id) ?? [];
            if (recipients.length === 0) {
              return { ...base, success: false, error: "No recipients could be resolved for this channel" };
            }
            const results = await Promise.all(
              recipients.map((recipient) =>
                definition.send({ channelId: channel.id, config, payload, recipient, deps })
              )
            );
            const failures = results.filter((result) => !result.success);
            if (failures.length === results.length) {
              return { ...base, success: false, error: failures.map((f) => f.error).join("; ") };
            }
            if (failures.length > 0) {
              logger.warn(
                `Alarm ${channel.channelType} channel had partial delivery failures [alarmId=${alarm.id}] [channelId=${channel.id}]: ${failures
                  .map((f) => f.error)
                  .join("; ")}`
              );
            }
            return { ...base, success: true };
          }

          const result = await definition.send({ channelId: channel.id, config, payload, deps });
          return { ...base, ...result };
        } catch (err) {
          const error = err instanceof Error ? err.message : "Unknown error";
          logger.error(err, `Failed to dispatch alarm ${channel.channelType} channel [alarmId=${alarm.id}]`);
          return { ...base, success: false, error };
        }
      })
    );

    const deliveries = channelResults.flatMap((result) =>
      result.targetIds.map((targetId) => ({
        targetId,
        channelId: result.channelId,
        channelType: result.channelType,
        status: result.success ? AlarmRunStatus.SUCCESS : AlarmRunStatus.FAILED
      }))
    );

    const errors = channelResults
      .filter((result) => !result.success && result.error)
      .map((result) => `${result.channelType}: ${result.error}`);
    const anyDelivered = channelResults.some((result) => result.success);
    let status = AlarmRunStatus.SUCCESS;
    if (errors.length > 0) status = anyDelivered ? AlarmRunStatus.PARTIAL : AlarmRunStatus.FAILED;
    const errorText = errors.length > 0 ? errors.join("\n") : undefined;

    if (errorText) {
      await notifyAdminsOfFailure(alarm, viewUrl, errorText);
    }

    await alarmHistoryDAL.createWithTargets(alarm.id, { status, error: errorText }, deliveries);
  };

  return { runAlarm };
};
