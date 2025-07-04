/* eslint-disable no-await-in-loop */
import { ForbiddenError } from "@casl/ability";
import { Knex } from "knex";

import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionSecretActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";

import { ActorAuthMethod, ActorType } from "../auth/auth-type";
import { TProjectMembershipDALFactory } from "../project-membership/project-membership-dal";
import { TReminderRecipientDALFactory } from "../reminder-recipients/reminder-dal";
import { SmtpTemplates, TSmtpService } from "../smtp/smtp-service";
import { TReminderDALFactory } from "./reminder-dal";
import { TBatchCreateReminderDTO, TCreateReminderDTO } from "./reminder-types";

type TReminderServiceFactoryDep = {
  reminderDAL: TReminderDALFactory;
  reminderRecipientDAL: TReminderRecipientDALFactory;
  smtpService: TSmtpService;
  projectMembershipDAL: Pick<TProjectMembershipDALFactory, "findAllProjectMembers">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
};

export type TReminderServiceFactory = ReturnType<typeof reminderServiceFactory>;

export const reminderServiceFactory = ({
  reminderDAL,
  reminderRecipientDAL,
  smtpService,
  projectMembershipDAL,
  permissionService
}: TReminderServiceFactoryDep) => {
  const addDays = (days: number, fromDate: Date = new Date()): Date => {
    const result = new Date(fromDate);
    result.setDate(result.getDate() + days);
    return result;
  };

  const $manageReminderRecipients = async (reminderId: string, newRecipients?: string[] | null): Promise<void> => {
    if (!newRecipients || newRecipients.length === 0) {
      // If no recipients provided, remove all existing recipients
      await reminderRecipientDAL.deleteById(reminderId);
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

  const createReminderInternal = async ({
    secretId,
    message,
    repeatDays,
    nextReminderDate: nextReminderDateInput,
    recipients
  }: {
    secretId?: string;
    message?: string | null;
    repeatDays?: number | null;
    nextReminderDate?: string | null;
    recipients?: string[] | null;
  }) => {
    if (!secretId) {
      throw new BadRequestError({ message: "secretId is required" });
    }
    let nextReminderDate;
    if (nextReminderDateInput) {
      nextReminderDate = new Date(nextReminderDateInput);
    }

    if (repeatDays && repeatDays > 0) {
      nextReminderDate = addDays(repeatDays);
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
        nextReminderDate
      });
      reminderId = existingReminder.id;
    } else {
      // Create new reminder
      const newReminder = await reminderDAL.create({
        secretId,
        message,
        repeatDays,
        nextReminderDate
      });
      reminderId = newReminder.id;
    }

    // Manage recipients (add/update/delete as needed)
    await $manageReminderRecipients(reminderId, recipients);

    return { id: reminderId, created: !existingReminder };
  };

  const createReminder = async ({
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    projectId,
    reminder
  }: TCreateReminderDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionSecretActions.Edit, ProjectPermissionSub.Secrets);

    const response = await createReminderInternal(reminder);
    return response;
  };

  const getReminder = async ({
    secretId,
    projectId,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod
  }: {
    secretId: string;
    projectId: string;
    actor: ActorType;
    actorId: string;
    actorOrgId: string;
    actorAuthMethod: ActorAuthMethod;
  }) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretActions.DescribeSecret,
      ProjectPermissionSub.Secrets
    );
    const reminder = await reminderDAL.findSecretReminder(secretId);
    return reminder;
  };

  const sendDailyReminders = async () => {
    const remindersToSend = await reminderDAL.findSecretDailyReminders();

    for (const reminder of remindersToSend) {
      try {
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
          await reminderDAL.updateById(reminder.id, { nextReminderDate: addDays(reminder.repeatDays) });
        } else {
          await reminderDAL.deleteById(reminder.id);
        }
      } catch (error) {
        logger.error(
          error,
          `Failed to send reminder to recipients ${reminder.recipients.map((r) => r.email).join(", ")}`
        );
      }
    }
  };

  const deleteReminder = async ({
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    secretId,
    projectId
  }: {
    actor: ActorType;
    actorId: string;
    actorOrgId: string;
    actorAuthMethod: ActorAuthMethod;
    secretId: string;
    projectId: string;
  }) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionSecretActions.Edit, ProjectPermissionSub.Secrets);
    await reminderDAL.delete({ secretId });
  };

  const removeReminderRecipients = async (secretId: string, tx?: Knex) => {
    const reminder = await reminderDAL.findOne({ secretId }, tx);
    if (!reminder) {
      return;
    }
    await reminderRecipientDAL.delete({ reminderId: reminder.id }, tx);
  };

  const deleteReminderBySecretId = async (secretId: string, tx?: Knex) => {
    await reminderDAL.delete({ secretId }, tx);
  };

  const batchCreateReminders = async (remindersData: TBatchCreateReminderDTO) => {
    if (!remindersData || remindersData.length === 0) {
      return { created: 0, reminderIds: [] };
    }

    const processedReminders = remindersData.map(
      ({ secretId, message, repeatDays, nextReminderDate: nextReminderDateInput, recipients }) => {
        let nextReminderDate;
        if (nextReminderDateInput) {
          nextReminderDate = new Date(nextReminderDateInput);
        }

        if (repeatDays && repeatDays > 0 && !nextReminderDate) {
          nextReminderDate = addDays(repeatDays);
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
          recipients: recipients ? [...new Set(recipients)] : []
        };
      }
    );

    const newReminders = await reminderDAL.insertMany(
      processedReminders.map(({ secretId, message, repeatDays, nextReminderDate }) => ({
        secretId,
        message,
        repeatDays,
        nextReminderDate
      }))
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
      await reminderRecipientDAL.insertMany(allRecipientInserts);
    }

    return {
      created: newReminders.length,
      reminderIds: newReminders.map((r) => r.id)
    };
  };

  return {
    createReminder,
    getReminder,
    sendDailyReminders,
    deleteReminder,
    removeReminderRecipients,
    deleteReminderBySecretId,
    batchCreateReminders,
    createReminderInternal
  };
};
