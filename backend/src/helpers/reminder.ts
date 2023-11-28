import { ISecret } from "../models";
import {
  createRecurringSecretReminder,
  deleteRecurringSecretReminder,
  updateRecurringSecretReminder
} from "../queues/reminders/sendSecretReminders";

type TPartialSecret = Pick<
  ISecret,
  "_id" | "secretReminderRepeatDays" | "secretReminderNote" | "workspace"
>;
type TPartialSecretDeleteReminder = Pick<ISecret, "_id" | "secretReminderRepeatDays">;

export const createReminder = async (oldSecret: TPartialSecret, newSecret: TPartialSecret) => {
  if (oldSecret._id !== newSecret._id) {
    throw new Error("Secret id's don't match");
  }

  if (!newSecret.secretReminderRepeatDays) {
    throw new Error("No repeat days provided");
  }

  const secretId = oldSecret._id.toString();
  const workspaceId = oldSecret.workspace.toString();

  if (oldSecret.secretReminderRepeatDays) {
    // This will first delete the existing recurring job, and then create a new one.
    await updateRecurringSecretReminder({
      workspaceId,
      secretId,
      repeatDays: newSecret.secretReminderRepeatDays,
      note: newSecret.secretReminderNote
    });
  } else {
    // This will create a new recurring job.
    await createRecurringSecretReminder({
      workspaceId,
      secretId,
      repeatDays: newSecret.secretReminderRepeatDays,
      note: newSecret.secretReminderNote
    });
  }
};

export const deleteReminder = async (secret: TPartialSecretDeleteReminder) => {
  if (!secret._id) {
    throw new Error("No secret id provided");
  }

  if (!secret.secretReminderRepeatDays) {
    throw new Error("No repeat days provided");
  }

  await deleteRecurringSecretReminder({
    secretId: secret._id.toString(),
    repeatDays: secret.secretReminderRepeatDays
  });
};
