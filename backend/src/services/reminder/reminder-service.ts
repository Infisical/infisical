/* eslint-disable no-await-in-loop */
import { ForbiddenError } from "@casl/ability";
import { Knex } from "knex";

import { ActionProjectType, TableName } from "@app/db/schemas/models";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionSecretActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";

import { ActorAuthMethod, ActorType } from "../auth/auth-type";
import { TProjectMembershipDALFactory } from "../project-membership/project-membership-dal";
import { TReminderRecipientDALFactory } from "../reminder-recipients/reminder-recipient-dal";
import { TSecretV2BridgeDALFactory } from "../secret-v2-bridge/secret-v2-bridge-dal";
import { SmtpTemplates, TSmtpService } from "../smtp/smtp-service";
import { TReminderDALFactory } from "./reminder-dal";
import { TBatchCreateReminderDTO, TCreateReminderDTO, TReminderServiceFactory } from "./reminder-types";

type TReminderServiceFactoryDep = {
  reminderDAL: TReminderDALFactory;
  reminderRecipientDAL: TReminderRecipientDALFactory;
  smtpService: TSmtpService;
  projectMembershipDAL: Pick<TProjectMembershipDALFactory, "findAllProjectMembers">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  secretV2BridgeDAL: Pick<TSecretV2BridgeDALFactory, "invalidateSecretCacheByProjectId" | "findOneWithTags">;
};

export const reminderServiceFactory = ({
  reminderDAL,
  reminderRecipientDAL,
  smtpService,
  projectMembershipDAL,
  permissionService,
  secretV2BridgeDAL
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
    const secret = await secretV2BridgeDAL.findOneWithTags({ [`${TableName.SecretV2}.id` as "id"]: reminder.secretId });
    if (!secret) {
      throw new BadRequestError({ message: `Secret ${reminder.secretId} not found` });
    }
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: secret.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionSecretActions.Edit, ProjectPermissionSub.Secrets);

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
    const secret = await secretV2BridgeDAL.findOneWithTags({ [`${TableName.SecretV2}.id` as "id"]: secretId });
    if (!secret) {
      throw new BadRequestError({ message: `Secret ${secretId} not found` });
    }
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: secret.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretActions.DescribeSecret,
      ProjectPermissionSub.Secrets
    );
    const reminder = await reminderDAL.findSecretReminder(secretId);
    return reminder;
  };

  const sendDailyReminders: TReminderServiceFactory["sendDailyReminders"] = async () => {
    const remindersToSend = await reminderDAL.findSecretDailyReminders();

    for (const reminder of remindersToSend) {
      try {
        await reminderDAL.transaction(async (tx) => {
          const recipients: string[] = reminder.recipients
            .map((r) => r.email)
            .filter((email): email is string => Boolean(email));
          if (recipients.length === 0) {
            const members = await projectMembershipDAL.findAllProjectMembers(reminder.projectId);
            recipients.push(...members.map((m) => m.user.email).filter((email): email is string => Boolean(email)));
          }
          await smtpService.sendMail({
            template: SmtpTemplates.SecretReminder,
            subjectLine: "Infisical secret reminder",
            recipients,
            substitutions: {
              reminderNote: reminder.message || "",
              projectName: reminder.projectName || "",
              organizationName: reminder.organizationName || ""
            }
          });
          if (reminder.repeatDays) {
            await reminderDAL.updateById(reminder.id, { nextReminderDate: $addDays(reminder.repeatDays) }, tx);
          } else {
            await reminderDAL.deleteById(reminder.id, tx);
          }
        });
      } catch (error) {
        logger.error(
          error,
          `Failed to send reminder to recipients ${reminder.recipients.map((r) => r.email).join(", ")}`
        );
      }
    }
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
    const secret = await secretV2BridgeDAL.findOneWithTags({ [`${TableName.SecretV2}.id` as "id"]: secretId });
    if (!secret) {
      throw new BadRequestError({ message: `Secret ${secretId} not found` });
    }
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: secret.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionSecretActions.Edit, ProjectPermissionSub.Secrets);
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
        let fromDate;
        if (nextReminderDateInput) {
          nextReminderDate = new Date(nextReminderDateInput);
        }

        if (repeatDays && !nextReminderDate) {
          if (fromDateInput) {
            fromDate = new Date(fromDateInput);
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
    sendDailyReminders,
    deleteReminder,
    deleteReminderBySecretId,
    batchCreateReminders,
    createReminderInternal,
    getRemindersForDashboard
  };
};
