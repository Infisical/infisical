import Queue, { Job } from "bull";
import { Secret, Workspace } from "../../models";
import { Types } from "mongoose";


type TSendSecretReminders = {
  workspaceId: string
  secretId: string
  cron: string
  note: string | undefined | null
}

type TDeleteSecretReminder = {
  secretId: string
  cron: string
}

export const sendSecretReminders = new Queue("send-secret-reminders", process.env.REDIS_URL as string);

sendSecretReminders.process(async (job: Job) => {
  const { workspaceId, secretId }: TSendSecretReminders = job.data
  const secret = await Secret.findById(new Types.ObjectId(secretId));
  const workspace = await Workspace.findById(new Types.ObjectId(workspaceId));


  if(!workspace || !secret) {
    throw new Error("Workspace or secret not found")
  }


  // Send email stuff here 
  


})

export const createSecretReminderCron = (jobDetails: TSendSecretReminders) => {
  return sendSecretReminders.add(jobDetails, {
    repeat: {
      cron: jobDetails.cron
    },
    jobId: `reminder-${jobDetails.secretId}`,
    
  })
}

export const deleteSecretReminderCron = (jobDetails: TDeleteSecretReminder) => {

  return sendSecretReminders.removeRepeatable({
    cron: jobDetails.cron,
    "jobId": `reminder-${jobDetails.secretId}`,
  })
}

export const updateSecretReminderCron = async (jobDetails: TSendSecretReminders) => {
  // We need to delete the potentially existing cron job first, or the new one won't be created.
  await deleteSecretReminderCron(jobDetails)

  await createSecretReminderCron(jobDetails)
}
