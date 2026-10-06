/* eslint-disable no-await-in-loop */
import { ForbiddenError, subject } from "@casl/ability";
import { Knex } from "knex";

import { ActionProjectType, TableName } from "@app/db/schemas";
import { throwIfMissingSecretReadValueOrDescribePermission } from "@app/ee/services/permission/permission-fns";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionSecretActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { TGenericPermission } from "@app/lib/types";

import { TAlertChannelInput, TChannelRecipientInput } from "../alert/alert-channel-service-types";
import { AlertChannelType } from "../alert/alert-channel-types";
import { TAlertServiceFactory } from "../alert/alert-service";
import { TAlertWritePlan } from "../alert/alert-service-types";
import { AlertPrincipalType, MAX_RECIPIENTS_PER_CHANNEL } from "../alert/alert-types";
import { ActorAuthMethod, ActorType } from "../auth/auth-type";
import { TEventEmitter } from "../event-outbox/event-outbox-types";
import { TSecretFolderDALFactory } from "../secret-folder/secret-folder-dal";
import { TSecretV2BridgeDALFactory } from "../secret-v2-bridge/secret-v2-bridge-dal";
import { TReminderDALFactory } from "./reminder-dal";
import { emitSecretReminderDue, SECRET_REMINDER_DUE_EVENT, SECRET_REMINDER_RESOURCE_TYPE } from "./reminder-events";
import { advanceReminderDate, getReminderDueWindow, toUtcDateString } from "./reminder-fns";
import { TBatchCreateReminderDTO, TCreateReminderDTO, TReminderServiceFactory } from "./reminder-types";

const ORPHAN_REAP_BATCH_SIZE = 500;
const MAX_ORPHAN_REAP_BATCHES = 20;
const MAX_ALERT_NAME_LENGTH = 255;

const reminderAlertName = (secretKey: string) => `Reminder for ${secretKey}`.slice(0, MAX_ALERT_NAME_LENGTH);

type TReminderServiceFactoryDep = {
  reminderDAL: TReminderDALFactory;
  eventEmitter: TEventEmitter;
  alertService: Pick<
    TAlertServiceFactory,
    | "prepareCreateAlert"
    | "prepareUpdateAlert"
    | "applyAlertWrite"
    | "findAlertChannelSummariesForResources"
    | "findRecipientsForResources"
    | "deleteAlertsForDeletedResources"
    | "repointAlertsForResource"
    | "copyAlertsForResource"
    | "filterRecipientsInScope"
  >;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  secretV2BridgeDAL: Pick<TSecretV2BridgeDALFactory, "invalidateSecretCacheByProjectId" | "findOneWithTags">;
  folderDAL: Pick<TSecretFolderDALFactory, "findSecretPathByFolderIds">;
};

export const reminderServiceFactory = ({
  reminderDAL,
  eventEmitter,
  alertService,
  permissionService,
  secretV2BridgeDAL,
  folderDAL
}: TReminderServiceFactoryDep): TReminderServiceFactory => {
  const $addDays = (days: number, fromDate: Date = new Date()): Date => {
    const result = new Date(fromDate);
    result.setDate(result.getDate() + days);
    return result;
  };

  const $findReminderRecipientIds = async (secretIds: string[], tx?: Knex): Promise<Map<string, string[]>> => {
    const rows = await alertService.findRecipientsForResources(
      {
        resourceType: SECRET_REMINDER_RESOURCE_TYPE,
        resourceIds: secretIds,
        channelType: AlertChannelType.EMAIL,
        principalType: AlertPrincipalType.USER
      },
      tx
    );
    const bySecret = new Map<string, string[]>();
    rows.forEach(({ resourceId, principalId }) => {
      bySecret.set(resourceId, [...(bySecret.get(resourceId) ?? []), principalId]);
    });
    return bySecret;
  };

  // Who a reminder's email goes to. An empty list keeps the reminder's original meaning: everyone in the
  // project.
  const $resolveEmailRecipients = async ({
    orgId,
    projectId,
    recipients
  }: {
    orgId: string;
    projectId: string;
    recipients?: string[] | null;
  }): Promise<TChannelRecipientInput[]> => {
    // Reminder recipients were never pruned when someone left the project, so drop them rather than fail.
    const requested = [...new Set(recipients ?? [])];
    const inScope = await alertService.filterRecipientsInScope(
      { orgId, projectId },
      requested.map((principalId) => ({ principalType: AlertPrincipalType.USER, principalId }))
    );
    // Falling back to the whole project here would send the secret's key, path and note to people nobody
    // chose, so a list with nobody left in it is refused instead.
    if (requested.length && !inScope.length) {
      throw new BadRequestError({
        message: "None of the selected reminder recipients are members of this project. Choose recipients again."
      });
    }
    return inScope.length ? inScope : [{ principalType: AlertPrincipalType.PROJECT_MEMBERS, principalId: projectId }];
  };

  // Given `channels`, they are the alert's complete channel list. Otherwise the reminder API only knows
  // user ids, so it owns the alert's email channels and leaves every other channel (Slack, webhook,
  // PagerDuty) as the user configured it. The alert is prepared as the caller, so the reminder provider
  // checks they can edit the secret, and the alert module refuses anything it would not accept from its
  // own API (eg more channels than an alert can hold).
  const $prepareReminderAlert = async ({
    secretId,
    secretKey,
    projectId,
    recipients,
    channels,
    actor
  }: {
    secretId: string;
    secretKey: string;
    projectId: string;
    recipients?: string[] | null;
    channels?: TAlertChannelInput[];
    actor: TGenericPermission;
  }): Promise<TAlertWritePlan> => {
    const [existing] = await alertService.findAlertChannelSummariesForResources({
      resourceType: SECRET_REMINDER_RESOURCE_TYPE,
      resourceIds: [secretId]
    });

    const $plan = (alertChannels: TAlertChannelInput[]) =>
      existing
        ? alertService.prepareUpdateAlert({
            alertId: existing.id,
            name: reminderAlertName(secretKey),
            channels: alertChannels,
            ...actor
          })
        : alertService.prepareCreateAlert({
            name: reminderAlertName(secretKey),
            resourceType: SECRET_REMINDER_RESOURCE_TYPE,
            resourceId: secretId,
            eventType: SECRET_REMINDER_DUE_EVENT,
            condition: null,
            projectId,
            channels: alertChannels,
            ...actor
          });

    if (channels) return $plan(channels);

    const emailRecipients = await $resolveEmailRecipients({ orgId: actor.actorOrgId, projectId, recipients });
    const existingEmailChannels =
      existing?.channels.filter((channel) => channel.channelType === AlertChannelType.EMAIL) ?? [];

    const emailChannels: TAlertChannelInput[] = [];
    for (let i = 0; i < emailRecipients.length; i += MAX_RECIPIENTS_PER_CHANNEL) {
      const index = emailChannels.length;
      emailChannels.push({
        ...(existingEmailChannels[index] ? { id: existingEmailChannels[index].id } : {}),
        name: existingEmailChannels[index]?.name ?? (index === 0 ? "Email" : `Email ${index + 1}`),
        channelType: AlertChannelType.EMAIL,
        recipients: emailRecipients.slice(i, i + MAX_RECIPIENTS_PER_CHANNEL)
      });
    }

    const otherChannels: TAlertChannelInput[] = (existing?.channels ?? [])
      .filter((channel) => channel.channelType !== AlertChannelType.EMAIL)
      .map((channel) => ({
        id: channel.id,
        name: channel.name,
        channelType: channel.channelType as AlertChannelType,
        enabled: channel.enabled
      }));

    return $plan([...emailChannels, ...otherChannels]);
  };

  const $getSecretForPermissionCheck = async (secretId: string) => {
    const secret = await secretV2BridgeDAL.findOneWithTags({ [`${TableName.SecretV2}.id` as "id"]: secretId });
    if (!secret) {
      throw new BadRequestError({ message: `Secret ${secretId} not found` });
    }

    const [folderWithPath] = await folderDAL.findSecretPathByFolderIds(secret.projectId, [secret.folderId]);
    if (!folderWithPath) {
      throw new NotFoundError({
        message: `Folder with id '${secret.folderId}' not found`
      });
    }

    return {
      secret,
      subjectFields: {
        environment: folderWithPath.environmentSlug,
        secretPath: folderWithPath.path,
        secretName: secret.key,
        secretTags: secret.tags.map((tag) => tag.slug)
      }
    };
  };

  const $schedule = ({
    repeatDays,
    nextReminderDate: nextReminderDateInput,
    fromDate: fromDateInput
  }: {
    repeatDays?: number | null;
    nextReminderDate?: string | null;
    fromDate?: string | null;
  }) => {
    let nextReminderDate;
    let fromDate;
    if (nextReminderDateInput) {
      nextReminderDate = new Date(nextReminderDateInput);
    }

    if (repeatDays) {
      if (fromDateInput) {
        fromDate = new Date(fromDateInput);
        nextReminderDate = fromDate;
      } else {
        nextReminderDate = $addDays(repeatDays);
      }
    }

    if (!nextReminderDate) {
      throw new BadRequestError({ message: "repeatDays must be a positive number" });
    }
    return { nextReminderDate, fromDate };
  };

  // Everything that can refuse a reminder runs here, before anything is written: the caller's permission on
  // the secret, the schedule, the recipients, and the alert module's own checks on the reminder's alert. A
  // caller that writes something else in the same request (a secret update) prepares first, so a refused
  // reminder fails the request before that write.
  const prepareReminder: TReminderServiceFactory["prepareReminder"] = async ({
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    reminder,
    secretKey
  }) => {
    const { secret, subjectFields } = await $getSecretForPermissionCheck(reminder.secretId!);
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: secret.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretActions.Edit,
      subject(ProjectPermissionSub.Secrets, subjectFields)
    );

    const { nextReminderDate, fromDate } = $schedule(reminder);
    const alertPlan = await $prepareReminderAlert({
      secretId: secret.id,
      secretKey: secretKey ?? secret.key,
      projectId: secret.projectId,
      recipients: reminder.recipients,
      channels: reminder.channels,
      actor: { actor, actorId, actorOrgId, actorAuthMethod }
    });

    return {
      secretId: secret.id,
      projectId: secret.projectId,
      row: { message: reminder.message, repeatDays: reminder.repeatDays, nextReminderDate, fromDate },
      alertPlan
    };
  };

  // Writes a prepared reminder and its alert in the caller's transaction, so the two land together.
  const applyReminder: TReminderServiceFactory["applyReminder"] = async (prepared, tx) => {
    await alertService.applyAlertWrite(prepared.alertPlan, tx);

    const existingReminder = await reminderDAL.findOne({ secretId: prepared.secretId }, tx);
    if (existingReminder) {
      await reminderDAL.updateById(existingReminder.id, prepared.row, tx);
      return { id: existingReminder.id, created: false };
    }
    const newReminder = await reminderDAL.create({ secretId: prepared.secretId, ...prepared.row }, tx);
    return { id: newReminder.id, created: true };
  };

  const createReminder: TReminderServiceFactory["createReminder"] = async (dto: TCreateReminderDTO) => {
    const prepared = await prepareReminder(dto);
    const result = await reminderDAL.transaction((tx) => applyReminder(prepared, tx));
    await secretV2BridgeDAL.invalidateSecretCacheByProjectId(prepared.projectId);
    return result;
  };

  const getReminder: TReminderServiceFactory["getReminder"] = async ({
    secretId,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod
  }: {
    secretId: string;
    actor: ActorType;
    actorId: string;
    actorOrgId: string;
    actorAuthMethod: ActorAuthMethod;
  }) => {
    const { secret, subjectFields } = await $getSecretForPermissionCheck(secretId);
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: secret.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    throwIfMissingSecretReadValueOrDescribePermission(
      permission,
      ProjectPermissionSecretActions.DescribeSecret,
      subjectFields
    );
    const reminder = await reminderDAL.findSecretReminder(secretId);
    if (!reminder) return null;
    const recipientIds = await $findReminderRecipientIds([secretId]);
    return { ...reminder, recipients: recipientIds.get(secretId) ?? [] };
  };

  const dispatchDueReminders: TReminderServiceFactory["dispatchDueReminders"] = async ({ now = new Date() } = {}) => {
    const dueReminders = await reminderDAL.findDueReminders(getReminderDueWindow(now));

    for (const reminder of dueReminders) {
      const { secretId } = reminder;
      // eslint-disable-next-line no-continue
      if (!secretId) continue;
      try {
        // Delivery happens in the alert module after commit, so nothing slow runs in this transaction.
        await reminderDAL.transaction(async (tx) => {
          // The due list was read before this transaction, so a reminder cancelled or rescheduled since
          // must not fire on its old date or have its new one overwritten.
          const current = await reminderDAL.findByIdForUpdate(reminder.id, tx);
          if (!current || current.nextReminderDate.getTime() !== reminder.nextReminderDate.getTime()) return;

          await emitSecretReminderDue(
            eventEmitter,
            {
              orgId: reminder.orgId,
              projectId: reminder.projectId,
              reminderId: reminder.id,
              secretId,
              note: current.message,
              repeatDays: current.repeatDays,
              occurrenceDate: toUtcDateString(current.nextReminderDate)
            },
            tx
          );
          if (current.repeatDays) {
            await reminderDAL.updateById(
              reminder.id,
              { nextReminderDate: advanceReminderDate(current.nextReminderDate, current.repeatDays, now) },
              tx
            );
          } else {
            await reminderDAL.deleteById(reminder.id, tx);
          }
        });
      } catch (error) {
        logger.error(error, `Failed to dispatch secret reminder [reminderId=${reminder.id}] [secretId=${secretId}]`);
      }
    }
  };

  // Deleting a reminder or its secret reaps the alert inline. This covers secrets removed by cascade
  // (folder, environment or project deletion), which no reminder code sees and which nothing cascades
  // to because alerts.resourceId has no foreign key.
  const reapOrphanedReminderAlerts: TReminderServiceFactory["reapOrphanedReminderAlerts"] = async () => {
    for (let batch = 0; batch < MAX_ORPHAN_REAP_BATCHES; batch += 1) {
      // eslint-disable-next-line no-await-in-loop -- each batch is its own short transaction
      const orphanedSecretIds = await reminderDAL.findOrphanedReminderAlertResourceIds({
        resourceType: SECRET_REMINDER_RESOURCE_TYPE,
        limit: ORPHAN_REAP_BATCH_SIZE
      });
      if (orphanedSecretIds.length === 0) return;

      // eslint-disable-next-line no-await-in-loop
      await alertService.deleteAlertsForDeletedResources({
        resourceType: SECRET_REMINDER_RESOURCE_TYPE,
        resourceIds: orphanedSecretIds
      });
      if (orphanedSecretIds.length < ORPHAN_REAP_BATCH_SIZE) return;
    }
    logger.warn(`Stopped reaping orphaned secret reminder alerts after ${MAX_ORPHAN_REAP_BATCHES} batches`);
  };

  const deleteReminder: TReminderServiceFactory["deleteReminder"] = async ({
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    secretId
  }: {
    actor: ActorType;
    actorId: string;
    actorOrgId: string;
    actorAuthMethod: ActorAuthMethod;
    secretId: string;
  }) => {
    const { secret, subjectFields } = await $getSecretForPermissionCheck(secretId);
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: secret.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretActions.Edit,
      subject(ProjectPermissionSub.Secrets, subjectFields)
    );
    await reminderDAL.delete({ secretId });
    await alertService.deleteAlertsForDeletedResources({
      resourceType: SECRET_REMINDER_RESOURCE_TYPE,
      resourceIds: [secretId]
    });
    await secretV2BridgeDAL.invalidateSecretCacheByProjectId(secret.projectId);
  };

  const deleteReminderBySecretId: TReminderServiceFactory["deleteReminderBySecretId"] = async (
    secretId: string,
    projectId: string,
    tx?: Knex
  ) => {
    await reminderDAL.delete({ secretId }, tx);
    await alertService.deleteAlertsForDeletedResources(
      { resourceType: SECRET_REMINDER_RESOURCE_TYPE, resourceIds: [secretId] },
      tx
    );
    await secretV2BridgeDAL.invalidateSecretCacheByProjectId(projectId);
  };

  const batchCreateReminders: TReminderServiceFactory["batchCreateReminders"] = async (
    remindersData: TBatchCreateReminderDTO,
    tx?: Knex
  ) => {
    if (!remindersData || remindersData.length === 0) {
      return { created: 0, reminderIds: [] };
    }

    const processedReminders = remindersData.map(
      ({
        secretId,
        message,
        repeatDays,
        nextReminderDate: nextReminderDateInput,
        projectId,
        fromDate: fromDateInput
      }) => {
        let nextReminderDate;
        const fromDate = fromDateInput ? new Date(fromDateInput) : undefined;
        if (nextReminderDateInput) {
          nextReminderDate = new Date(nextReminderDateInput);
        }

        if (repeatDays && !nextReminderDate) {
          if (fromDate) {
            nextReminderDate = fromDate;
          } else {
            nextReminderDate = $addDays(repeatDays);
          }
        }

        if (!nextReminderDate) {
          throw new BadRequestError({
            message: `repeatDays must be a positive number for secretId: ${secretId}`
          });
        }

        return {
          secretId,
          message,
          repeatDays,
          nextReminderDate,
          projectId,
          fromDate
        };
      }
    );

    const newReminders = await reminderDAL.insertMany(
      processedReminders.map(({ secretId, message, repeatDays, nextReminderDate, fromDate }) => ({
        secretId,
        message,
        repeatDays,
        nextReminderDate,
        fromDate
      })),
      tx
    );

    const projectIds = new Set(processedReminders.map((r) => r.projectId).filter((id): id is string => Boolean(id)));
    for (const projectId of projectIds) {
      await secretV2BridgeDAL.invalidateSecretCacheByProjectId(projectId);
    }

    return {
      created: newReminders.length,
      reminderIds: newReminders.map((r) => r.id)
    };
  };

  type TReminderAlertMove = { fromSecretId: string; toSecretId: string };

  // A destination secret that already had a reminder loses that reminder in the move, so its alert goes too.
  const $clearDestinationReminderAlerts = (moves: TReminderAlertMove[], tx: Knex) =>
    alertService.deleteAlertsForDeletedResources(
      { resourceType: SECRET_REMINDER_RESOURCE_TYPE, resourceIds: moves.map((move) => move.toSecretId) },
      tx
    );

  const $alertResource = (move: TReminderAlertMove) => ({
    resourceType: SECRET_REMINDER_RESOURCE_TYPE,
    fromResourceId: move.fromSecretId,
    toResourceId: move.toSecretId
  });

  // For a secret that is deleted at its source. Alerts follow it to its new id rather than being rebuilt,
  // so channel secrets (webhook signing keys, PagerDuty integration keys) and send history go with it.
  const moveReminderAlerts: TReminderServiceFactory["moveReminderAlerts"] = async (moves, tx) => {
    if (moves.length === 0) return;
    await $clearDestinationReminderAlerts(moves, tx);
    for (const move of moves) {
      await alertService.repointAlertsForResource($alertResource(move), tx);
    }
  };

  // For a secret that stays at its source as well. Its reminder keeps firing there, so it keeps its alert
  // and the destination gets its own.
  const copyReminderAlerts: TReminderServiceFactory["copyReminderAlerts"] = async (moves, tx) => {
    if (moves.length === 0) return;
    await $clearDestinationReminderAlerts(moves, tx);
    for (const move of moves) {
      await alertService.copyAlertsForResource($alertResource(move), tx);
    }
  };

  const getRemindersForDashboard: TReminderServiceFactory["getRemindersForDashboard"] = async (secretIds) => {
    // scott we don't need to check permissions/secret existence because these are the
    // secrets from the dashboard that have already gone through these checks

    const reminders = await reminderDAL.findSecretReminders(secretIds);
    const recipientIds = await $findReminderRecipientIds(
      reminders.map((reminder) => reminder.secretId).filter((id): id is string => Boolean(id))
    );

    const reminderMap: Record<string, (typeof reminders)[number] & { recipients: string[] }> = {};

    reminders.forEach((reminder) => {
      if (reminder.secretId) {
        reminderMap[reminder.secretId] = { ...reminder, recipients: recipientIds.get(reminder.secretId) ?? [] };
      }
    });

    return reminderMap;
  };

  return {
    prepareReminder,
    applyReminder,
    createReminder,
    getReminder,
    dispatchDueReminders,
    reapOrphanedReminderAlerts,
    deleteReminder,
    deleteReminderBySecretId,
    batchCreateReminders,
    moveReminderAlerts,
    copyReminderAlerts,
    getRemindersForDashboard
  };
};
