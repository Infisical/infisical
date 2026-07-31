import { OrgMembershipRole, OrgMembershipStatus, ProjectMembershipRole } from "@app/db/schemas";
import { KeyStorePrefixes, KeyStoreTtls, TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { CronJobName, TCronJobFactory } from "@app/lib/cron/cron-job";
import { groupBy } from "@app/lib/fn";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";
import { getIntegrationOptions } from "@app/services/integration-auth/integration-list";
import { TNotificationServiceFactory } from "@app/services/notification/notification-service";
import { NotificationType } from "@app/services/notification/notification-types";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TProjectMembershipDALFactory } from "@app/services/project-membership/project-membership-dal";
import { SmtpTemplates, TSmtpService } from "@app/services/smtp/smtp-service";

import { TIntegrationDALFactory } from "./integration-dal";
import {
  buildNativeIntegrationsPath,
  buildNativeIntegrationsUrl,
  groupIntegrationsByProject,
  TIntegrationProjectSummary,
  TNoticeRecipient,
  toRecipients
} from "./integration-deprecation-fns";

type TIntegrationDeprecationQueueFactoryDep = {
  integrationDAL: Pick<
    TIntegrationDALFactory,
    "findOrgIdsWithIntegrations" | "findProjectIntegrationsByOrgId" | "hasIntegrationsByOrgId"
  >;
  orgDAL: Pick<TOrgDALFactory, "findOrgMembersByRole" | "findById">;
  projectMembershipDAL: Pick<TProjectMembershipDALFactory, "findProjectMembersByProjectIds">;
  smtpService: Pick<TSmtpService, "sendMail">;
  notificationService: Pick<TNotificationServiceFactory, "createUserNotifications">;
  keyStore: Pick<TKeyStoreFactory, "setItemWithExpiryNX">;
  queueService: TQueueServiceFactory;
  cronJob: TCronJobFactory;
};

export type TIntegrationDeprecationQueueFactory = ReturnType<typeof integrationDeprecationQueueFactory>;

const NOTICE_SUBJECT = "Action recommended: move native integrations to Secret Syncs";
const NOTICE_BODY =
  "Native integrations are deprecated. Secret Syncs are the maintained replacement and cover the same third-party services.";

/**
 * Monthly nudge toward Secret Syncs for every org still holding native integrations.
 *
 * The cron tick only enumerates orgs and fans out one BullMQ job each; the worker does the mail. An org drops out
 * of the notice on its own as soon as it has migrated off native integrations.
 */
export const integrationDeprecationQueueFactory = ({
  integrationDAL,
  orgDAL,
  projectMembershipDAL,
  smtpService,
  notificationService,
  keyStore,
  queueService,
  cronJob
}: TIntegrationDeprecationQueueFactoryDep) => {
  const sendNotice = async ({
    orgId,
    orgName,
    projects,
    recipients,
    siteUrl,
    link
  }: {
    orgId: string;
    orgName: string;
    projects: TIntegrationProjectSummary[];
    recipients: TNoticeRecipient[];
    siteUrl: string;
    /** site-relative — see buildNativeIntegrationsPath */
    link?: string;
  }) => {
    if (!recipients.length || !projects.length) return;

    // the worker can run long after the tick enqueued this job, and the caller sends several notices in
    // sequence — re-check per notice so an org that migrated in the meantime stops hearing about it
    if (!(await integrationDAL.hasIntegrationsByOrgId(orgId))) {
      logger.info(`integrationDeprecationNotice: org no longer has native integrations, skipping [orgId=${orgId}]`);
      return;
    }

    try {
      await smtpService.sendMail({
        template: SmtpTemplates.NativeIntegrationDeprecation,
        subjectLine: NOTICE_SUBJECT,
        recipients: recipients.map((recipient) => recipient.email),
        substitutions: {
          orgName,
          projects: projects.map((project) => ({
            name: project.projectName,
            integrations: project.integrations,
            url: buildNativeIntegrationsUrl(siteUrl, orgId, project.projectId)
          }))
        }
      });
    } catch (error) {
      logger.error(error, `integrationDeprecationNotice: failed to send email [orgId=${orgId}]`);
    }

    try {
      await notificationService.createUserNotifications(
        recipients.map((recipient) => ({
          userId: recipient.userId,
          orgId,
          type: NotificationType.NATIVE_INTEGRATION_DEPRECATED,
          title: "Native integrations are moving to Secret Syncs",
          body: NOTICE_BODY,
          link
        }))
      );
    } catch (error) {
      logger.error(error, `integrationDeprecationNotice: failed to create notifications [orgId=${orgId}]`);
    }
  };

  const sendOrgNotices = async ({ orgId, period }: { orgId: string; period: string }) => {
    const appCfg = getConfig();
    if (!appCfg.SITE_URL) return;

    // set before sending: for a recurring nudge a missed month is cheaper than a duplicate blast to every admin
    const claimed = await keyStore.setItemWithExpiryNX(
      KeyStorePrefixes.NativeIntegrationDeprecationNotice(orgId, period),
      KeyStoreTtls.NativeIntegrationDeprecationNoticeInSeconds,
      "1"
    );
    if (!claimed) {
      logger.info(`integrationDeprecationNotice: already notified [orgId=${orgId}] [period=${period}]`);
      return;
    }

    const rows = await integrationDAL.findProjectIntegrationsByOrgId(orgId);
    if (!rows.length) return;

    const integrationOptions = await getIntegrationOptions();
    const integrationNameBySlug = new Map(integrationOptions.map((option) => [option.slug, option.name]));
    const projects = groupIntegrationsByProject(rows, integrationNameBySlug);

    const org = await orgDAL.findById(orgId);
    if (!org) return;

    const [orgAdmins, projectAdmins] = await Promise.all([
      // findOrgMembersByRole includes members who were invited but never accepted
      orgDAL.findOrgMembersByRole(orgId, OrgMembershipRole.Admin),
      projectMembershipDAL.findProjectMembersByProjectIds(
        projects.map((project) => project.projectId),
        { roles: [ProjectMembershipRole.Admin], orgId }
      )
    ]);

    const orgAdminRecipients = toRecipients(
      orgAdmins
        .filter((admin) => admin.status !== OrgMembershipStatus.Invited && !admin.isTemporary)
        .map((admin) => ({ userId: admin.user.id, email: admin.user.email }))
    );
    const orgAdminUserIds = new Set(orgAdminRecipients.map((recipient) => recipient.userId));
    // scope=project rows always carry a projectId; the ! only satisfies the nullable column type
    const projectAdminsByProjectId = groupBy(projectAdmins, (member) => member.projectId!);

    // every recipient list is resolved above; from here on it is only sending
    const { SITE_URL: siteUrl } = appCfg;
    const notify = (recipients: TNoticeRecipient[], noticeProjects: TIntegrationProjectSummary[], link?: string) =>
      sendNotice({ orgId, orgName: org.name, siteUrl, recipients, projects: noticeProjects, link });

    // org admins get one notice covering every affected project; a deep link only makes sense when there is a
    // single project to point at
    await notify(
      orgAdminRecipients,
      projects,
      projects.length === 1 ? buildNativeIntegrationsPath(orgId, projects[0].projectId) : undefined
    );

    // then each project's admins get a notice scoped to their own project, minus anyone already reached above
    for await (const project of projects) {
      await notify(
        toRecipients(projectAdminsByProjectId[project.projectId] ?? [], orgAdminUserIds),
        [project],
        buildNativeIntegrationsPath(orgId, project.projectId)
      );
    }

    logger.info(
      `integrationDeprecationNotice: notices sent [orgId=${orgId}] [period=${period}] [projectCount=${projects.length}]`
    );
  };

  const init = () => {
    const appCfg = getConfig();

    cronJob.register({
      name: CronJobName.MonthlyNativeIntegrationDeprecationNotice,
      pattern: "0 0 1 * *",
      runHashTtlS: 7 * 24 * 60 * 60,
      enabled: !appCfg.isSecondaryInstance,
      handler: async () => {
        if (!appCfg.SITE_URL) {
          logger.info("cron[monthly-native-integration-deprecation-notice]: skipped, SITE_URL is not configured");
          return;
        }

        // YYYY-MM (UTC) — scopes the per-org idempotency key so retries of this fire dedupe against each other
        const period = new Date().toISOString().slice(0, 7);
        const orgIds = await integrationDAL.findOrgIdsWithIntegrations();

        logger.info(
          `cron[monthly-native-integration-deprecation-notice]: enqueuing [orgCount=${orgIds.length}] [period=${period}]`
        );

        for await (const orgId of orgIds) {
          await queueService.queue(
            QueueName.IntegrationDeprecationNotice,
            QueueJobs.SendIntegrationDeprecationNotice,
            { orgId, period },
            {
              jobId: `integration-deprecation-notice-${orgId}-${period}`,
              removeOnComplete: true,
              removeOnFail: true
            }
          );
        }
      }
    });

    queueService.start(
      QueueName.IntegrationDeprecationNotice,
      async (job) => {
        await sendOrgNotices(job.data);
      },
      // caps how many orgs are processed at once; each job then sends its own notices sequentially
      { concurrency: 5, limiter: { max: 20, duration: 1000 } }
    );
  };

  return { init };
};
