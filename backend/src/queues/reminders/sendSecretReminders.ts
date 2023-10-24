import Queue, { Job } from "bull";
import { IUser, Membership, Organization, Workspace } from "../../models";
import { Types } from "mongoose";
import { sendMail } from "../../helpers";

type TSendSecretReminders = {
  workspaceId: string;
  secretId: string;
  cron: string;
  note: string | undefined | null;
};

type TDeleteSecretReminder = {
  secretId: string;
  cron: string;
};

export const sendSecretReminders = new Queue(
  "send-secret-reminders",
  process.env.REDIS_URL as string
);

sendSecretReminders.process(async (job: Job<TSendSecretReminders>) => {
  const { workspaceId }: TSendSecretReminders = job.data;

  const workspace = await Workspace.findById(new Types.ObjectId(workspaceId));
  const organization = await Organization.findById(new Types.ObjectId(workspace?.organization));

  if (!workspace) {
    throw new Error("Workspace for reminder not found");
  }
  if (!organization) {
    throw new Error("Organization for reminder not found");
  }

  const memberships = await Membership.find({
    workspace: workspaceId
    // We need to get the user and organization data for each membership.
  }).populate<{ user: IUser }>("user");

  await sendMail({
    template: "secretReminder.handlebars",
    subjectLine: "Infisical secret reminder",
    recipients: [...memberships.map((membership) => membership.user.email)],
    substitutions: {
      reminderNote: job.data.note, // May not exist.
      workspaceName: workspace.name,
      organizationName: organization.name
    }
  });
});

export const createSecretReminderCron = (jobDetails: TSendSecretReminders) => {
  return sendSecretReminders.add(jobDetails, {
    repeat: {
      cron: jobDetails.cron
    },
    jobId: `reminder-${jobDetails.secretId}`,
    removeOnComplete: true,
    removeOnFail: {
      count: 20
    }
  });
};

export const deleteSecretReminderCron = (jobDetails: TDeleteSecretReminder) => {
  return sendSecretReminders.removeRepeatable({
    cron: jobDetails.cron,
    jobId: `reminder-${jobDetails.secretId}`
  });
};

export const updateSecretReminderCron = async (jobDetails: TSendSecretReminders) => {
  // We need to delete the potentially existing cron job first, or the new one won't be created.
  await deleteSecretReminderCron(jobDetails);

  await createSecretReminderCron(jobDetails);
};
