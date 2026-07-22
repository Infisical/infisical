import pLimit from "p-limit";

import { OrgMembershipRole, OrgMembershipStatus, TAlerts } from "@app/db/schemas";
import { logger } from "@app/lib/logger";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TNotificationServiceFactory } from "@app/services/notification/notification-service";
import { NotificationType } from "@app/services/notification/notification-types";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TSmtpService } from "@app/services/smtp/smtp-service";

import { decryptChannelConfig, getAlertChannelCipher } from "./alert-channel-crypto-fns";
import { TAlertChannelDALFactory } from "./alert-channel-dal";
import { TAlertChannelRecipientDALFactory } from "./alert-channel-recipient-dal";
import { AlertChannelType, TAlertChannelDeps, TAlertRecipient } from "./alert-channel-types";
import { TAlertHistoryDALFactory } from "./alert-history-dal";
import { TAlertProviderRegistry } from "./alert-provider-registry";
import { TAlertRecipientResolver } from "./alert-recipient-resolver";
import { AlertRunStatus, DEFAULT_DEDUP_WINDOW_HOURS, TAlertContext } from "./alert-types";
import { ALERT_CHANNEL_REGISTRY } from "./channels/alert-channel-registry";

const FAILURE_NOTIFICATION_MAX_ERROR_LENGTH = 200;

const RECIPIENT_SEND_CONCURRENCY = 10;

export type TAlertEngineDep = {
  alertChannelDAL: Pick<TAlertChannelDALFactory, "findByAlertId">;
  alertChannelRecipientDAL: Pick<TAlertChannelRecipientDALFactory, "findByChannelIds">;
  alertHistoryDAL: Pick<TAlertHistoryDALFactory, "createWithTargets" | "findRecentlyAlertedTargets">;
  alertProviderRegistry: TAlertProviderRegistry;
  alertRecipientResolver: Pick<TAlertRecipientResolver, "resolveMany">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  orgDAL: Pick<TOrgDALFactory, "findOrgMembersByRole">;
  notificationService: Pick<TNotificationServiceFactory, "createUserNotifications">;
  smtpService: Pick<TSmtpService, "sendMail">;
};

export type TAlertEngine = ReturnType<typeof alertEngineFactory>;

export const alertEngineFactory = ({
  alertChannelDAL,
  alertChannelRecipientDAL,
  alertHistoryDAL,
  alertProviderRegistry,
  alertRecipientResolver,
  kmsService,
  orgDAL,
  notificationService,
  smtpService
}: TAlertEngineDep) => {
  const notifyAdminsOfFailure = async (alert: TAlerts, viewUrl: string, error: string) => {
    try {
      const admins = (await orgDAL.findOrgMembersByRole(alert.orgId, OrgMembershipRole.Admin)).filter(
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
          orgId: alert.orgId,
          type: NotificationType.ALERT_CHANNEL_FAILED,
          title: `Alert Channel Failed: ${alert.name}`,
          body: `Your alert **${alert.name}** failed to deliver on one or more channels: \`${truncatedError}\``,
          link: viewUrl
        }))
      );
    } catch (err) {
      logger.error(err, `Failed to notify admins of alert channel failure [alertId=${alert.id}]`);
    }
  };

  const runAlert = async (alert: TAlerts) => {
    const provider = alertProviderRegistry.get(alert.resourceType);
    if (!provider) {
      logger.warn(`No alert provider registered for resource type '${alert.resourceType}' [alertId=${alert.id}]`);
      return;
    }

    const targets = await provider.findDueTargets({
      orgId: alert.orgId,
      projectId: alert.projectId,
      resourceId: alert.resourceId,
      eventType: alert.eventType,
      condition: alert.condition,
      filters: alert.filters
    });
    if (targets.length === 0) return;

    const channels = await alertChannelDAL.findByAlertId(alert.id, { enabled: true });
    if (channels.length === 0) return;

    const window = provider.dedupWindowHours?.(alert.condition) ?? DEFAULT_DEDUP_WINDOW_HOURS;
    const candidateIds = targets.map((target) => provider.targetId(target));
    const recentlyAlerted = await alertHistoryDAL.findRecentlyAlertedTargets(alert.id, candidateIds, window);
    const alertedSet = new Set(recentlyAlerted.map((row) => `${row.channelId}:${row.targetId}`));

    const channelWork = channels
      .map((channel) => {
        const definition = ALERT_CHANNEL_REGISTRY[channel.channelType as AlertChannelType];
        const dueTargets = targets.filter((target) => !alertedSet.has(`${channel.id}:${provider.targetId(target)}`));
        const cap = definition?.maxTargetsPerRun;
        if (cap && dueTargets.length > cap) {
          logger.info(
            `Alert ${channel.channelType} channel capped at ${cap} targets this run; ${dueTargets.length - cap} deferred to the next run [alertId=${alert.id}] [channelId=${channel.id}]`
          );
          return { channel, dueTargets: dueTargets.slice(0, cap) };
        }
        return { channel, dueTargets };
      })
      .filter((work) => work.dueTargets.length > 0);
    if (channelWork.length === 0) return;

    const alertContext: TAlertContext = {
      id: alert.id,
      name: alert.name,
      orgId: alert.orgId,
      projectId: alert.projectId,
      resourceType: alert.resourceType,
      resourceId: alert.resourceId,
      eventType: alert.eventType,
      condition: alert.condition,
      filters: alert.filters
    };
    const viewUrl = await provider.buildViewUrl(alertContext);

    const { decryptor } = await getAlertChannelCipher(kmsService, {
      orgId: alert.orgId,
      projectId: alert.projectId
    });

    const directedChannelIds = channelWork
      .filter((work) => ALERT_CHANNEL_REGISTRY[work.channel.channelType as AlertChannelType]?.directed)
      .map((work) => work.channel.id);
    let recipientsByChannel = new Map<string, TAlertRecipient[]>();
    if (directedChannelIds.length) {
      const recipientRows = await alertChannelRecipientDAL.findByChannelIds(directedChannelIds);
      const rowsByChannel = new Map<string, { principalType: string; principalId: string }[]>();
      recipientRows.forEach((row) => {
        const list = rowsByChannel.get(row.channelId) ?? [];
        list.push(row);
        rowsByChannel.set(row.channelId, list);
      });
      recipientsByChannel = await alertRecipientResolver.resolveMany(rowsByChannel, {
        orgId: alert.orgId,
        projectId: alert.projectId
      });
    }

    const deps: TAlertChannelDeps = { smtpService };

    const channelResults = await Promise.all(
      channelWork.map(async ({ channel, dueTargets }) => {
        const targetIds = dueTargets.map((target) => provider.targetId(target));
        const base = { channelId: channel.id, channelType: channel.channelType, targetIds };
        const definition = ALERT_CHANNEL_REGISTRY[channel.channelType as AlertChannelType];
        if (!definition) return { ...base, success: false, error: "Unknown channel type" };

        let config: unknown;
        try {
          config = decryptChannelConfig(channel.encryptedConfig, decryptor);
        } catch (err) {
          logger.error(err, `Failed to decrypt alert channel config [channelId=${channel.id}]`);
          return { ...base, success: false, error: "Failed to decrypt channel config" };
        }

        const payload = provider.buildPayload(alertContext, dueTargets, viewUrl);

        try {
          if (definition.directed) {
            const recipients = recipientsByChannel.get(channel.id) ?? [];
            if (recipients.length === 0) {
              return { ...base, success: false, error: "No recipients could be resolved for this channel" };
            }
            const sendLimit = pLimit(RECIPIENT_SEND_CONCURRENCY);
            const results = await Promise.all(
              recipients.map((recipient) =>
                sendLimit(() => definition.send({ channelId: channel.id, config, payload, recipient, deps }))
              )
            );
            const failures = results.filter((result) => !result.success);
            if (failures.length === results.length) {
              return { ...base, success: false, error: failures.map((f) => f.error).join("; ") };
            }
            if (failures.length > 0) {
              logger.warn(
                `Alert ${channel.channelType} channel had partial delivery failures [alertId=${alert.id}] [channelId=${channel.id}]: ${failures
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
          logger.error(err, `Failed to dispatch alert ${channel.channelType} channel [alertId=${alert.id}]`);
          return { ...base, success: false, error };
        }
      })
    );

    const deliveries = channelResults.flatMap((result) =>
      result.targetIds.map((targetId) => ({
        targetId,
        channelId: result.channelId,
        channelType: result.channelType,
        status: result.success ? AlertRunStatus.SUCCESS : AlertRunStatus.FAILED
      }))
    );

    const errors = channelResults
      .filter((result) => !result.success && result.error)
      .map((result) => `${result.channelType}: ${result.error}`);
    const anyDelivered = channelResults.some((result) => result.success);
    let status = AlertRunStatus.SUCCESS;
    if (errors.length > 0) status = anyDelivered ? AlertRunStatus.PARTIAL : AlertRunStatus.FAILED;
    const errorText = errors.length > 0 ? errors.join("\n") : undefined;

    if (errorText) {
      await notifyAdminsOfFailure(alert, viewUrl, errorText);
    }

    await alertHistoryDAL.createWithTargets(alert.id, { status, error: errorText }, deliveries);
  };

  return { runAlert };
};
