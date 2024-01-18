import { getConfig } from "@app/lib/config/env";
import { daysToMillisecond, secondsToMillis } from "@app/lib/dates";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueJobTypes, TQueueServiceFactory } from "@app/queue";
import { TOrgDalFactory } from "@app/services/org/org-dal";
import { TProjectDalFactory } from "@app/services/project/project-dal";
import { TProjectMembershipDalFactory } from "@app/services/project-membership/project-membership-dal";
import { SmtpTemplates, TSmtpService } from "@app/services/smtp/smtp-service";

export type TSecretReminderQueueFactory = ReturnType<typeof secretReminderQueueFactory>;

type TSecretReminderQueueFactoryDep = {
  queue: TQueueServiceFactory;
  projectMembershipDal: Pick<TProjectMembershipDalFactory, "findAllProjectMembers">;
  orgDal: Pick<TOrgDalFactory, "findOrgById" | "findOrgByProjectId">;
  projectDal: Pick<TProjectDalFactory, "findById">;
  smtpService: TSmtpService;
};

export const secretReminderQueueFactory = ({
  queue,
  projectMembershipDal,
  smtpService,
  orgDal,
  projectDal
}: TSecretReminderQueueFactoryDep) => {
  const addToQueue = async (data: TQueueJobTypes["secret-reminder"]["payload"]) => {
    const appCfg = getConfig();
    queue.queue(QueueName.SecretReminder, QueueJobs.SecretReminder, data, {
      jobId: `reminder-${data.secretId}`,
      repeat: {
        // on prod it this will be in days, in development this will be second
        every:
          appCfg.NODE_ENV === "development"
            ? secondsToMillis(data.repeatDays)
            : daysToMillisecond(data.repeatDays),
        immediately: true
      }
    });
  };

  const removeFromQueue = async (secretId: string, repeatDays: number) => {
    const appCfg = getConfig();
    await queue.stopRepeatableJob(
      QueueName.SecretReminder,
      QueueJobs.SecretReminder,
      {
        // on prod it this will be in days, in development this will be second
        every:
          appCfg.NODE_ENV === "development"
            ? secondsToMillis(repeatDays)
            : daysToMillisecond(repeatDays)
      },
      `reminder-${secretId}`
    );
  };

  queue.start(QueueName.SecretReminder, async ({ data }) => {
    logger.info(`secretReminderQueue.process: [secretDocument=${data.secretId}]`);

    const { projectId } = data;

    const organization = await orgDal.findOrgByProjectId(projectId);
    const project = await projectDal.findById(projectId);

    if (!organization) {
      logger.info(
        `secretReminderQueue.process: [secretDocument=${data.secretId}] no organization found`
      );
      return;
    }

    if (!project) {
      logger.info(
        `secretReminderQueue.process: [secretDocument=${data.secretId}] no project found`
      );
      return;
    }

    const projectMembers = await projectMembershipDal.findAllProjectMembers(projectId);

    if (!projectMembers || !projectMembers.length) {
      logger.info(
        `secretReminderQueue.process: [secretDocument=${data.secretId}] no project members found`
      );
      return;
    }

    await smtpService.sendMail({
      template: SmtpTemplates.SecretReminder,
      subjectLine: "Infisical secret reminder",
      recipients: [...projectMembers.map((m) => m.user.email)],
      substitutions: {
        reminderNote: data.note, // May not be present.
        projectName: project.name,
        organizationName: organization.name
      }
    });
  });

  return {
    addToQueue,
    removeFromQueue
  };
};
