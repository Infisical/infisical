import Queue, { Job } from "bull";
import { IUser, Membership, Organization, Workspace } from "../../models";
import { Types } from "mongoose";
import { sendMail } from "../../helpers";

type TSendSecretReminders = {
  workspaceId: string;
  secretId: string;
  repeatDays: number;
  note: string | undefined | null;
};

type TDeleteSecretReminder = {
  secretId: string;
  repeatDays: number;
};

const DAY_IN_MS = 86400000;

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
  }).populate<{ user: IUser }>("user");

  await sendMail({
    template: "secretReminder.handlebars",
    subjectLine: "Infisical secret reminder",
    recipients: [...memberships.map((membership) => membership.user.email)],
    substitutions: {
      reminderNote: job.data.note, // May not be present.
      workspaceName: workspace.name,
      organizationName: organization.name
    }
  });
});

export const createRecurringSecretReminder = (jobDetails: TSendSecretReminders) => {
  const repeat = jobDetails.repeatDays * DAY_IN_MS;

  return sendSecretReminders.add(jobDetails, {
    delay: repeat,
    repeat: {
      every: repeat
    },
    jobId: `reminder-${jobDetails.secretId}`,
    removeOnComplete: true,
    removeOnFail: {
      count: 20
    }
  });
};

export const deleteRecurringSecretReminder = (jobDetails: TDeleteSecretReminder) => {
  const repeat = jobDetails.repeatDays * DAY_IN_MS;

  return sendSecretReminders.removeRepeatable({
    every: repeat,
    jobId: `reminder-${jobDetails.secretId}`
  });
};

export const updateRecurringSecretReminder = async (jobDetails: TSendSecretReminders) => {
  // We need to delete the potentially existing reminder job first, or the new one won't be created.
  await deleteRecurringSecretReminder(jobDetails);
  await createRecurringSecretReminder(jobDetails);
};
