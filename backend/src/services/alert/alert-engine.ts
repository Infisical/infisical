import pLimit from "p-limit";

import { TAlerts } from "@app/db/schemas";
import { logger } from "@app/lib/logger";
import { AlertDispatchOutcome } from "@app/lib/telemetry/metrics";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TSmtpService } from "@app/services/smtp/smtp-service";

import { decryptChannelConfig, getAlertChannelCipher } from "./alert-channel-crypto-fns";
import { TAlertChannelDALFactory } from "./alert-channel-dal";
import { TAlertChannelRecipientDALFactory } from "./alert-channel-recipient-dal";
import { AlertChannelType, TAlertChannelDeps, TAlertRecipient, TChannelTargetResult } from "./alert-channel-types";
import { TAlertHistoryDALFactory } from "./alert-history-dal";
import { TAlertProviderRegistry } from "./alert-provider-registry";
import { TAlertRecipientResolver } from "./alert-recipient-resolver";
import { AlertRunStatus, DEFAULT_DEDUP_WINDOW_HOURS, TAlertContext } from "./alert-types";
import { ALERT_CHANNEL_REGISTRY } from "./channels/alert-channel-registry";

const ALERT_DELIVERY_CONCURRENCY = 10;

type TChannelDispatchResult = {
  channelId: string;
  channelType: string;
  targetIds: string[];
  success: boolean;
  error?: string;
  targetResults?: TChannelTargetResult[];
  skipped?: boolean;
};

export type TAlertEngineDep = {
  alertChannelDAL: Pick<TAlertChannelDALFactory, "findByAlertId">;
  alertChannelRecipientDAL: Pick<TAlertChannelRecipientDALFactory, "findByChannelIds">;
  alertHistoryDAL: Pick<TAlertHistoryDALFactory, "createWithTargets" | "findRecentlyAlertedTargets">;
  alertProviderRegistry: TAlertProviderRegistry;
  alertRecipientResolver: Pick<TAlertRecipientResolver, "resolveMany">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
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
  smtpService
}: TAlertEngineDep) => {
  const runAlert = async (alert: TAlerts, opts?: { asOf?: Date }): Promise<AlertDispatchOutcome> => {
    const provider = alertProviderRegistry.get(alert.resourceType);
    if (!provider) {
      logger.warn(`No alert provider registered for resource type '${alert.resourceType}' [alertId=${alert.id}]`);
      return AlertDispatchOutcome.NoProvider;
    }

    const channels = await alertChannelDAL.findByAlertId(alert.id, { enabled: true });
    if (channels.length === 0) return AlertDispatchOutcome.NoChannels;

    const dueTargets = await provider.findDueTargets({
      orgId: alert.orgId,
      projectId: alert.projectId,
      resourceId: alert.resourceId,
      eventType: alert.eventType,
      condition: alert.condition,
      asOf: opts?.asOf ?? new Date()
    });
    if (dueTargets.length === 0) return AlertDispatchOutcome.NoDueTargets;

    const targets = dueTargets.map((target) => ({ target, id: provider.targetId(target) }));

    const window = provider.dedupWindowHours?.(alert.condition) ?? DEFAULT_DEDUP_WINDOW_HOURS;
    const recentlyAlerted = await alertHistoryDAL.findRecentlyAlertedTargets(
      alert.id,
      targets.map((target) => target.id),
      window
    );
    const alertedSet = new Set(recentlyAlerted.map((row) => `${row.channelId}:${row.targetId}`));

    const channelWork = channels
      .map((channel) => {
        const definition = ALERT_CHANNEL_REGISTRY[channel.channelType as AlertChannelType];
        const due = targets.filter((target) => !alertedSet.has(`${channel.id}:${target.id}`));
        const cap = definition?.maxTargetsPerRun;
        if (cap && due.length > cap) {
          logger.info(
            `Alert ${channel.channelType} channel capped at ${cap} targets this run; ${due.length - cap} deferred to the next run [alertId=${alert.id}] [channelId=${channel.id}]`
          );
          return { channel, due: due.slice(0, cap) };
        }
        return { channel, due };
      })
      .filter((work) => work.due.length > 0);
    if (channelWork.length === 0) return AlertDispatchOutcome.AllDeduped;

    const alertContext: TAlertContext = {
      id: alert.id,
      name: alert.name,
      orgId: alert.orgId,
      projectId: alert.projectId,
      resourceType: alert.resourceType,
      resourceId: alert.resourceId,
      eventType: alert.eventType,
      condition: alert.condition
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

    const sendLimit = pLimit(ALERT_DELIVERY_CONCURRENCY);

    const channelResults = await Promise.all(
      channelWork.map(async ({ channel, due }): Promise<TChannelDispatchResult> => {
        const targetIds = due.map((target) => target.id);
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

        const payload = provider.buildPayload(
          alertContext,
          due.map((target) => target.target),
          viewUrl
        );

        try {
          if (definition.directed) {
            const recipients = recipientsByChannel.get(channel.id) ?? [];
            if (recipients.length === 0) {
              logger.warn(
                `Alert ${channel.channelType} channel has no resolvable recipients; skipping it this run [alertId=${alert.id}] [channelId=${channel.id}]`
              );
              return { ...base, success: false, skipped: true };
            }
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

          const result = await sendLimit(() => definition.send({ channelId: channel.id, config, payload, deps }));
          return { ...base, ...result };
        } catch (err) {
          const error = err instanceof Error ? err.message : "Unknown error";
          logger.error(err, `Failed to dispatch alert ${channel.channelType} channel [alertId=${alert.id}]`);
          return { ...base, success: false, error };
        }
      })
    );

    const dispatched = channelResults.filter((result) => !result.skipped);
    if (dispatched.length === 0) return AlertDispatchOutcome.NoRecipients;

    const deliveries = dispatched.flatMap((result) => {
      const perTarget = new Map<string, boolean>((result.targetResults ?? []).map((t) => [t.targetId, t.success]));
      return result.targetIds.map((targetId) => ({
        targetId,
        channelId: result.channelId,
        channelType: result.channelType,
        status: (perTarget.get(targetId) ?? result.success) ? AlertRunStatus.SUCCESS : AlertRunStatus.FAILED
      }));
    });

    const errors = dispatched
      .filter((result) => !result.success && result.error)
      .map((result) => `${result.channelType}: ${result.error}`);
    const anyDelivered = dispatched.some((result) => result.success);
    let status = AlertRunStatus.SUCCESS;
    if (errors.length > 0) status = anyDelivered ? AlertRunStatus.PARTIAL : AlertRunStatus.FAILED;
    const errorText = errors.length > 0 ? errors.join("\n") : undefined;

    if (errorText) {
      logger.error(`Alert delivery failed on one or more channels [alertId=${alert.id}]: ${errorText}`);
    }

    await alertHistoryDAL.createWithTargets(alert.id, { status }, deliveries);

    if (status === AlertRunStatus.SUCCESS) return AlertDispatchOutcome.DeliverySuccess;
    return status === AlertRunStatus.PARTIAL
      ? AlertDispatchOutcome.DeliveryPartial
      : AlertDispatchOutcome.DeliveryFailed;
  };

  return { runAlert };
};
