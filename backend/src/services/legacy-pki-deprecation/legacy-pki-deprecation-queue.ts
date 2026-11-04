import { OrgMembershipRole, OrgMembershipStatus, ProjectMembershipRole } from "@app/db/schemas";
import { KeyStorePrefixes, KeyStoreTtls, TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { CronJobName, TCronJobFactory } from "@app/lib/cron/cron-job";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";
import { toRecipients } from "@app/services/integration/integration-deprecation-fns";
import { TNotificationServiceFactory } from "@app/services/notification/notification-service";
import { NotificationType } from "@app/services/notification/notification-types";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TProjectMembershipDALFactory } from "@app/services/project-membership/project-membership-dal";
import { SmtpTemplates, TSmtpService } from "@app/services/smtp/smtp-service";

import { TLegacyPkiDeprecationDALFactory } from "./legacy-pki-deprecation-dal";

type TLegacyPkiDeprecationQueueFactoryDep = {
  legacyPkiDeprecationDAL: TLegacyPkiDeprecationDALFactory;
  orgDAL: Pick<TOrgDALFactory, "findOrgMembersByRole">;
  projectMembershipDAL: Pick<TProjectMembershipDALFactory, "findProjectMembersByProjectIds">;
  smtpService: Pick<TSmtpService, "sendMail">;
  notificationService: Pick<TNotificationServiceFactory, "createUserNotifications">;
  keyStore: Pick<TKeyStoreFactory, "setItemWithExpiryNX">;
  queueService: TQueueServiceFactory;
  cronJob: TCronJobFactory;
};

export type TLegacyPkiDeprecationQueueFactory = ReturnType<typeof legacyPkiDeprecationQueueFactory>;

// keep in sync with frontend/src/const/legacyPkiDeprecation.ts
const LEGACY_PKI_DEPRECATION_DATE = "December 15, 2026";
const LEGACY_PKI_DEPRECATION_DATE_UTC = new Date("2026-12-15T00:00:00Z");

const EMAIL_SUBJECT = `Certificate templates and subscribers are being removed on ${LEGACY_PKI_DEPRECATION_DATE}`;
// shorter than the subject: the notification dropdown ellipsises it on one line
const NOTIFICATION_TITLE = `Certificate templates and subscribers are being removed ${LEGACY_PKI_DEPRECATION_DATE}`;
const NOTIFICATION_BODY = "Move to certificate applications before then. Existing certificates stay valid.";

/**
 * Monthly nudge toward certificate applications for every org still holding a certificate template or a PKI
 * subscriber. The cron tick enumerates orgs and fans out one job each; an org drops out once it has none left.
 */
export const legacyPkiDeprecationQueueFactory = ({
  legacyPkiDeprecationDAL,
  orgDAL,
  projectMembershipDAL,
  smtpService,
  notificationService,
  keyStore,
  queueService,
  cronJob
}: TLegacyPkiDeprecationQueueFactoryDep) => {
  const sendOrgNotice = async ({ orgId, period }: { orgId: string; period: string }) => {
    const appCfg = getConfig();
    if (!appCfg.SITE_URL) return;

    const claimed = await keyStore.setItemWithExpiryNX(
      KeyStorePrefixes.LegacyPkiDeprecationNotice(orgId, period),
      KeyStoreTtls.LegacyPkiDeprecationNoticeInSeconds,
      "1"
    );
    if (!claimed) {
      logger.info(`legacyPkiDeprecationNotice: already notified [orgId=${orgId}] [period=${period}]`);
      return;
    }

    const [{ subscriberProjectIds, templateProjectIds }, orgAdmins] = await Promise.all([
      legacyPkiDeprecationDAL.findLegacyPkiProjectIdsByOrgId(orgId),
      orgDAL.findOrgMembersByRole(orgId, OrgMembershipRole.Admin)
    ]);

    const projectIds = [...new Set([...subscriberProjectIds, ...templateProjectIds])];

    if (!projectIds.length) {
      logger.info(`legacyPkiDeprecationNotice: org no longer has legacy PKI resources, skipping [orgId=${orgId}]`);
      return;
    }

    const projectAdmins = await projectMembershipDAL.findProjectMembersByProjectIds(projectIds, {
      roles: [ProjectMembershipRole.Admin],
      orgId
    });

    const orgAdminRecipients = toRecipients(
      orgAdmins
        .filter((admin) => admin.status !== OrgMembershipStatus.Invited && admin.user.isActive)
        .map((admin) => ({ userId: admin.user.id, email: admin.user.email }))
    );
    const recipients = [
      ...orgAdminRecipients,
      ...toRecipients(projectAdmins, new Set(orgAdminRecipients.map((recipient) => recipient.userId)))
    ];

    if (!recipients.length) {
      logger.info(`legacyPkiDeprecationNotice: no admins to notify [orgId=${orgId}]`);
      return;
    }

    // relative, since the router resolves notification links against the current location. Only one
    // project to point at, and only at a page that holds something.
    const projectPath = `/organizations/${orgId}/projects/cert-manager/${projectIds[0]}`;
    let link: string | undefined;
    if (projectIds.length === 1) {
      link = subscriberProjectIds.includes(projectIds[0])
        ? `${projectPath}/subscribers`
        : `${projectPath}/certificate-templates`;
    }

    const sendEmail = async () => {
      try {
        await smtpService.sendMail({
          template: SmtpTemplates.LegacyPkiDeprecation,
          subjectLine: EMAIL_SUBJECT,
          recipients: recipients.map((recipient) => recipient.email),
          substitutions: { deprecationDate: LEGACY_PKI_DEPRECATION_DATE }
        });
      } catch (error) {
        logger.error(error, `legacyPkiDeprecationNotice: failed to send email [orgId=${orgId}]`);
      }
    };

    const createNotifications = async () => {
      try {
        await notificationService.createUserNotifications(
          recipients.map((recipient) => ({
            userId: recipient.userId,
            orgId,
            type: NotificationType.LEGACY_PKI_DEPRECATED,
            title: NOTIFICATION_TITLE,
            body: NOTIFICATION_BODY,
            link
          }))
        );
      } catch (error) {
        logger.error(error, `legacyPkiDeprecationNotice: failed to create notifications [orgId=${orgId}]`);
      }
    };

    await Promise.all([sendEmail(), createNotifications()]);

    logger.info(`legacyPkiDeprecationNotice: notice sent [orgId=${orgId}] [period=${period}]`);
  };

  const init = () => {
    const appCfg = getConfig();

    cronJob.register({
      name: CronJobName.MonthlyLegacyPkiDeprecationNotice,
      pattern: "0 0 15 * *",
      // must outlive the longest gap between two fires, or a restarted pod re-enqueues the previous one
      runHashTtlS: 40 * 24 * 60 * 60,
      enabled: !appCfg.isSecondaryInstance,
      handler: async () => {
        if (!appCfg.SITE_URL) {
          logger.info("cron[monthly-legacy-pki-deprecation-notice]: skipped, SITE_URL is not configured");
          return;
        }

        if (new Date() >= LEGACY_PKI_DEPRECATION_DATE_UTC) {
          logger.info("cron[monthly-legacy-pki-deprecation-notice]: skipped, removal date has passed");
          return;
        }

        // YYYY-MM, so retries of this fire dedupe against each other
        const period = new Date().toISOString().slice(0, 7);
        const orgIds = await legacyPkiDeprecationDAL.findOrgIdsWithLegacyPkiResources();

        logger.info(
          `cron[monthly-legacy-pki-deprecation-notice]: enqueuing [orgCount=${orgIds.length}] [period=${period}]`
        );

        await Promise.all(
          orgIds.map((orgId) =>
            queueService.queue(
              QueueName.LegacyPkiDeprecationNotice,
              QueueJobs.SendLegacyPkiDeprecationNotice,
              { orgId, period },
              {
                jobId: `legacy-pki-deprecation-notice-${orgId}-${period}`,
                removeOnComplete: true,
                removeOnFail: true
              }
            )
          )
        );
      }
    });

    queueService.start(
      QueueName.LegacyPkiDeprecationNotice,
      async (job) => {
        await sendOrgNotice(job.data);
      },
      { concurrency: 5, limiter: { max: 20, duration: 1000 } }
    );
  };

  return { init };
};
