import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";

import { TSecretReminderQueueFactory } from "./secret-reminder-queue";
import {
  TCreateSecretReminderDTO,
  TDeleteSecretReminderDTO,
  THandleReminderDTO
} from "./secret-reminder-types";

type TSecretReminderServiceFactoryDep = {
  secretReminderQueue: TSecretReminderQueueFactory;
};

export type TSecretReminderServiceFactory = ReturnType<typeof secretReminderServiceFactory>;

export const secretReminderServiceFactory = ({
  secretReminderQueue
}: TSecretReminderServiceFactoryDep) => {
  const createReminder = async ({ oldSecret, newSecret, projectId }: TCreateSecretReminderDTO) => {
    try {
      if (oldSecret.id !== newSecret.id) {
        throw new BadRequestError({
          name: "SecretReminderIdMismatch",
          message: "Existing secret didn't match the updated secret ID."
        });
      }

      if (!newSecret.secretReminderRepeatDays) {
        throw new BadRequestError({
          name: "SecretReminderRepeatDaysMissing",
          message: "Secret reminder repeat days is missing."
        });
      }

      // If the secret already has a reminder, we should remove the existing one first.
      if (oldSecret.secretReminderRepeatDays) {
        await secretReminderQueue.removeFromQueue(oldSecret.id, oldSecret.secretReminderRepeatDays);
      }

      await secretReminderQueue.addToQueue({
        note: newSecret.secretReminderNote,
        projectId,
        repeatDays: newSecret.secretReminderRepeatDays,
        secretId: newSecret.id
      });
    } catch (err) {
      logger.error(err, "Failed to create secret reminder.");
      throw new BadRequestError({
        name: "SecretReminderCreateFailed",
        message: "Failed to create secret reminder."
      });
    }
  };

  const deleteReminder = async ({ secretId, repeatDays }: TDeleteSecretReminderDTO) => {
    try {
      await secretReminderQueue.removeFromQueue(secretId, repeatDays);
    } catch (err) {
      logger.error(err, "Failed to remove secret reminder from queue.");
      throw new BadRequestError({
        name: "SecretReminderDeleteFailed",
        message: "Failed to delete secret reminder."
      });
    }
  };

  // A handler function to cut down on code duplication in the future.
  const handleReminder = async ({ newSecret, oldSecret, projectId }: THandleReminderDTO) => {
    const { secretReminderRepeatDays, secretReminderNote } = newSecret;

    if (newSecret.type !== "personal" && secretReminderRepeatDays !== undefined) {
      if (
        (secretReminderRepeatDays &&
          oldSecret.secretReminderRepeatDays !== secretReminderRepeatDays) ||
        (secretReminderNote && oldSecret.secretReminderNote !== secretReminderNote)
      ) {
        await createReminder({
          oldSecret,
          newSecret,
          projectId
        });
      } else if (
        secretReminderRepeatDays === null &&
        secretReminderNote === null &&
        oldSecret.secretReminderRepeatDays
      ) {
        await deleteReminder({
          secretId: oldSecret.id,
          repeatDays: oldSecret.secretReminderRepeatDays
        });
      }
    }
  };

  return {
    createReminder,
    deleteReminder,
    handleReminder
  };
};
