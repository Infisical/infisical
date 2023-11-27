import {
  createSecretReminderCron,
  deleteSecretReminderCron,
  updateSecretReminderCron
} from "../queues/reminders/sendSecretReminders";
import { ISecret } from "../models";

type TPartialSecret = Pick<
  ISecret,
  "_id" | "secretReminderCron" | "secretReminderNote" | "workspace"
>;
type TPartialSecretDeleteReminder = Pick<ISecret, "_id" | "secretReminderCron">;

export const createReminder = async (oldSecret: TPartialSecret, newSecret: TPartialSecret) => {
  if (oldSecret._id !== newSecret._id) {
    throw new Error("Secret id's don't match");
  }

  if (!newSecret.secretReminderCron) {
    throw new Error("No cron provided");
  }

  const secretId = oldSecret._id.toString();
  const workspaceId = oldSecret.workspace.toString();

  if (oldSecret.secretReminderCron) {
    // This will first delete the existing cron job, and then create a new one.
    await updateSecretReminderCron({
      workspaceId,
      secretId,
      cron: newSecret.secretReminderCron,
      note: newSecret.secretReminderNote
    });
  } else {
    // This will create a new cron job.
    await createSecretReminderCron({
      workspaceId,
      secretId,
      cron: newSecret.secretReminderCron,
      note: newSecret.secretReminderNote
    });
  }
};

export const deleteReminder = async (secret: TPartialSecretDeleteReminder) => {
  if (!secret._id) {
    throw new Error("No secret id provided");
  }

  if (!secret.secretReminderCron) {
    throw new Error("No cron provided");
  }

  await deleteSecretReminderCron({
    secretId: secret._id.toString(),
    cron: secret.secretReminderCron
  });
};
