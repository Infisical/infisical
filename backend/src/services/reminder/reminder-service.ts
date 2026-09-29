/* eslint-disable no-await-in-loop */
import { ForbiddenError, subject } from "@casl/ability";
import { Knex } from "knex";

import { ActionProjectType, TableName } from "@app/db/schemas";
import { throwIfMissingSecretReadValueOrDescribePermission } from "@app/ee/services/permission/permission-fns";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionSecretActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";

import { TAlertServiceFactory } from "../alert/alert-service";
import { ActorAuthMethod, ActorType } from "../auth/auth-type";
import { TEventEmitter } from "../event-outbox/event-outbox-types";
import { TReminderRecipientDALFactory } from "../reminder-recipients/reminder-recipient-dal";
import { TSecretFolderDALFactory } from "../secret-folder/secret-folder-dal";
import { TSecretV2BridgeDALFactory } from "../secret-v2-bridge/secret-v2-bridge-dal";
import { TReminderDALFactory } from "./reminder-dal";
import { emitSecretReminderDue, SECRET_REMINDER_RESOURCE_TYPE } from "./reminder-events";
import { advanceReminderDate, getReminderDueWindow, toUtcDateString } from "./reminder-fns";
import { TBatchCreateReminderDTO, TCreateReminderDTO, TReminderServiceFactory } from "./reminder-types";

const ORPHAN_REAP_BATCH_SIZE = 500;
const MAX_ORPHAN_REAP_BATCHES = 20;

type TReminderServiceFactoryDep = {
  reminderDAL: TReminderDALFactory;
  reminderRecipientDAL: TReminderRecipientDALFactory;
  eventEmitter: TEventEmitter;
  alertService: Pick<TAlertServiceFactory, "deleteAlertsForDeletedResources">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  secretV2BridgeDAL: Pick<TSecretV2BridgeDALFactory, "invalidateSecretCacheByProjectId" | "findOneWithTags">;
  folderDAL: Pick<TSecretFolderDALFactory, "findSecretPathByFolderIds">;
};

export const reminderServiceFactory = ({
  reminderDAL,
  reminderRecipientDAL,
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

  const $manageReminderRecipients = async (reminderId: string, newRecipients?: string[] | null): Promise<void> => {
    if (!newRecipients || newRecipients.length === 0) {
      // If no recipients provided, remove all existing recipients
      await reminderRecipientDAL.delete({ reminderId });
      return;
    }

    // Remove duplicates from input
    const uniqueRecipients = [...new Set(newRecipients)];

    // Get existing recipients
    const existingRecipients = await reminderRecipientDAL.find({ reminderId });
    const existingUserIds = new Set(existingRecipients.map((r) => r.userId));
    const newUserIds = new Set(uniqueRecipients);

    // Find recipients to add and remove
    const recipientsToAdd = uniqueRecipients.filter((userId) => !existingUserIds.has(userId));
    const recipientsToRemove = existingRecipients.filter((r) => !newUserIds.has(r.userId));

    // Perform database operations
    if (recipientsToRemove.length > 0) {
      await reminderRecipientDAL.delete({ $in: { id: recipientsToRemove.map((r) => r.id) } });
    }

    if (recipientsToAdd.length > 0) {
      await reminderRecipientDAL.insertMany(
        recipientsToAdd.map((userId) => ({
          reminderId,
          userId
        }))
      );
    }
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

  const createReminderInternal: TReminderServiceFactory["createReminderInternal"] = async ({
    secretId,
    message,
    repeatDays,
    nextReminderDate: nextReminderDateInput,
    recipients,
    projectId,
    fromDate: fromDateInput
  }: {
    secretId?: string;
    message?: string | null;
    repeatDays?: number | null;
    nextReminderDate?: string | null;
    recipients?: string[] | null;
    fromDate?: string | null;
    projectId: string;
  }) => {
    if (!secretId) {
      throw new BadRequestError({ message: "secretId is required" });
    }
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

    const existingReminder = await reminderDAL.findOne({ secretId });
    let reminderId: string;

    if (existingReminder) {
      // Update existing reminder
      await reminderDAL.updateById(existingReminder.id, {
        message,
        repeatDays,
        nextReminderDate,
        fromDate
      });
      reminderId = existingReminder.id;
    } else {
      // Create new reminder
      const newReminder = await reminderDAL.create({
        secretId,
        message,
        repeatDays,
        nextReminderDate,
        fromDate
      });
      reminderId = newReminder.id;
    }

    // Manage recipients (add/update/delete as needed)
    await $manageReminderRecipients(reminderId, recipients);
    await secretV2BridgeDAL.invalidateSecretCacheByProjectId(projectId);
    return { id: reminderId, created: !existingReminder };
  };

  const createReminder: TReminderServiceFactory["createReminder"] = async ({
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    reminder
  }: TCreateReminderDTO) => {
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

    const response = await createReminderInternal({
      ...reminder,
      projectId: secret.projectId
    });
    return response;
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
    return reminder;
  };

  const dispatchDueReminders: TReminderServiceFactory["dispatchDueReminders"] = async () => {
    const now = new Date();
    const dueReminders = await reminderDAL.findDueReminders(getReminderDueWindow(now));

    for (const reminder of dueReminders) {
      const { secretId } = reminder;
      // eslint-disable-next-line no-continue
      if (!secretId) continue;
      try {
        // Delivery happens in the alert module after commit, so nothing slow runs in this transaction.
        await reminderDAL.transaction(async (tx) => {
          await emitSecretReminderDue(
            eventEmitter,
            {
              orgId: reminder.orgId,
              projectId: reminder.projectId,
              secretId,
              note: reminder.message,
              repeatDays: reminder.repeatDays,
              occurrenceDate: toUtcDateString(reminder.nextReminderDate)
            },
            tx
          );
          if (reminder.repeatDays) {
            await reminderDAL.updateById(
              reminder.id,
              { nextReminderDate: advanceReminderDate(reminder.nextReminderDate, reminder.repeatDays, now) },
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
    await secretV2BridgeDAL.invalidateSecretCacheByProjectId(secret.projectId);
  };

  const deleteReminderBySecretId: TReminderServiceFactory["deleteReminderBySecretId"] = async (
    secretId: string,
    projectId: string,
    tx?: Knex
  ) => {
    await reminderDAL.delete({ secretId }, tx);
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
        recipients,
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
          recipients: recipients ? [...new Set(recipients)] : [],
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

    const allRecipientInserts: Array<{ reminderId: string; userId: string }> = [];

    newReminders.forEach((reminder, index) => {
      const { recipients } = processedReminders[index];
      if (recipients && recipients.length > 0) {
        recipients.forEach((userId) => {
          allRecipientInserts.push({
            reminderId: reminder.id,
            userId
          });
        });
      }
    });

    if (allRecipientInserts.length > 0) {
      await reminderRecipientDAL.insertMany(allRecipientInserts, tx);
    }

    const projectIds = new Set(processedReminders.map((r) => r.projectId).filter((id): id is string => Boolean(id)));
    for (const projectId of projectIds) {
      await secretV2BridgeDAL.invalidateSecretCacheByProjectId(projectId);
    }

    return {
      created: newReminders.length,
      reminderIds: newReminders.map((r) => r.id)
    };
  };

  const getRemindersForDashboard: TReminderServiceFactory["getRemindersForDashboard"] = async (secretIds) => {
    // scott we don't need to check permissions/secret existence because these are the
    // secrets from the dashboard that have already gone through these checks

    const reminders = await reminderDAL.findSecretReminders(secretIds);

    const reminderMap: Record<string, (typeof reminders)[number]> = {};

    reminders.forEach((reminder) => {
      if (reminder.secretId) reminderMap[reminder.secretId] = reminder;
    });

    return reminderMap;
  };

  return {
    createReminder,
    getReminder,
    dispatchDueReminders,
    reapOrphanedReminderAlerts,
    deleteReminder,
    deleteReminderBySecretId,
    batchCreateReminders,
    createReminderInternal,
    getRemindersForDashboard
  };
};
