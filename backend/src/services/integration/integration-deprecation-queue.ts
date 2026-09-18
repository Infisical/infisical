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
  NATIVE_INTEGRATION_DEPRECATION_DATE,
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

const PROJECT_ADMIN_EMAIL_SUBJECT = `Action required: Migrate Native Integrations by ${NATIVE_INTEGRATION_DEPRECATION_DATE}`;
const getOrgAdminEmailSubject = (projectCount: number, orgName: string) =>
  projectCount === 1
    ? `Action needed: 1 project in ${orgName} still uses native integrations`
    : `Action needed: ${projectCount} projects in ${orgName} still use native integrations`;
// the notification dropdown renders the title on a single ellipsised line next to a timestamp, so this
// stays shorter than the subject line and front-loads the part that matters
const NOTIFICATION_TITLE = `Native integrations stop working ${NATIVE_INTEGRATION_DEPRECATION_DATE}`;
const NOTIFICATION_BODY = `Recreate your native integrations as Secret Syncs before ${NATIVE_INTEGRATION_DEPRECATION_DATE} to keep your secrets syncing.`;

// slug -> display name, built from static config; identical for every job, so computed once
let integrationNameBySlugCache: Map<string, string> | undefined;
const getIntegrationNameBySlug = async () => {
  if (!integrationNameBySlugCache) {
    const integrationOptions = await getIntegrationOptions();
    integrationNameBySlugCache = new Map(integrationOptions.map((option) => [option.slug, option.name]));
  }
  return integrationNameBySlugCache;
};

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
    recipients,
    email,
    link
  }: {
    orgId: string;
    recipients: TNoticeRecipient[];
    email: {
      template: SmtpTemplates;
      subjectLine: string;
      substitutions: Record<string, unknown>;
    };
    /** site-relative — see buildNativeIntegrationsPath */
    link?: string;
  }) => {
    if (!recipients.length) return;

    const sendEmail = async () => {
      try {
        await smtpService.sendMail({
          template: email.template,
          subjectLine: email.subjectLine,
          recipients: recipients.map((recipient) => recipient.email),
          substitutions: email.substitutions
        });
      } catch (error) {
        logger.error(error, `integrationDeprecationNotice: failed to send email [orgId=${orgId}]`);
      }
    };

    const createNotifications = async () => {
      try {
        await notificationService.createUserNotifications(
          recipients.map((recipient) => ({
            userId: recipient.userId,
            orgId,
            type: NotificationType.NATIVE_INTEGRATION_DEPRECATED,
            title: NOTIFICATION_TITLE,
            body: NOTIFICATION_BODY,
            link
          }))
        );
      } catch (error) {
        logger.error(error, `integrationDeprecationNotice: failed to create notifications [orgId=${orgId}]`);
      }
    };

    // independent channels, each with its own error handling — one failing must not block the other
    await Promise.all([sendEmail(), createNotifications()]);
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

    const [hasIntegrations, rows, org, orgAdmins] = await Promise.all([
      integrationDAL.hasIntegrationsByOrgId(orgId),
      integrationDAL.findProjectIntegrationsByOrgId(orgId),
      orgDAL.findById(orgId),
      // findOrgMembersByRole includes members who were invited but never accepted
      orgDAL.findOrgMembersByRole(orgId, OrgMembershipRole.Admin)
    ]);

    if (!hasIntegrations) {
      logger.info(`integrationDeprecationNotice: org no longer has native integrations, skipping [orgId=${orgId}]`);
      return;
    }
    if (!rows.length || !org) return;

    const projects = groupIntegrationsByProject(rows, await getIntegrationNameBySlug());

    const projectAdmins = await projectMembershipDAL.findProjectMembersByProjectIds(
      projects.map((project) => project.projectId),
      { roles: [ProjectMembershipRole.Admin], orgId }
    );

    const orgAdminRecipients = toRecipients(
      orgAdmins
        .filter((admin) => admin.status !== OrgMembershipStatus.Invited && admin.user.isActive)
        .map((admin) => ({ userId: admin.user.id, email: admin.user.email }))
    );
    const orgAdminUserIds = new Set(orgAdminRecipients.map((recipient) => recipient.userId));
    // scope=project rows always carry a projectId; the ! only satisfies the nullable column type
    const projectAdminsByProjectId = groupBy(projectAdmins, (member) => member.projectId!);

    // every recipient list is resolved above; from here on it is only sending
    const { SITE_URL: siteUrl } = appCfg;

    // org admins get one notice covering every affected project; a deep link only makes sense when there is a
    // single project to point at
    await sendNotice({
      orgId,
      recipients: orgAdminRecipients,
      email: {
        template: SmtpTemplates.NativeIntegrationDeprecationOrgAdmin,
        subjectLine: getOrgAdminEmailSubject(projects.length, org.name),
        substitutions: { orgName: org.name, projectCount: projects.length }
      },
      link: projects.length === 1 ? buildNativeIntegrationsPath(orgId, projects[0].projectId) : undefined
    });

    // then each project's admins get a notice scoped to their own project, minus anyone already reached above
    for await (const project of projects) {
      const recipients = toRecipients(projectAdminsByProjectId[project.projectId] ?? [], orgAdminUserIds);

      if (!recipients?.length) {
        logger.info(
          `integrationDeprecationNotice: no project admins to notify [orgId=${orgId}] [projectId=${project.projectId}]`
        );
        // eslint-disable-next-line no-continue
        continue;
      }

      await sendNotice({
        orgId,
        recipients,
        email: {
          template: SmtpTemplates.NativeIntegrationDeprecationProjectAdmin,
          subjectLine: PROJECT_ADMIN_EMAIL_SUBJECT,
          substitutions: {
            orgName: org.name,
            project: {
              name: project.projectName,
              integrations: project.integrations,
              url: buildNativeIntegrationsUrl(siteUrl, orgId, project.projectId)
            }
          }
        },
        link: buildNativeIntegrationsPath(orgId, project.projectId)
      });
    }

    logger.info(
      `integrationDeprecationNotice: notices sent [orgId=${orgId}] [period=${period}] [projectCount=${projects.length}]`
    );
  };

  const init = () => {
    const appCfg = getConfig();

    cronJob.register({
      name: CronJobName.MonthlyNativeIntegrationDeprecationNotice,
      pattern: "0 0 19 2,5,8,11 *",
      // must outlive the longest gap between two fires (92 days). The run hash is the only thing stopping a
      // restarted pod from re-enqueuing the previous fire, since lastEnqueuedAt is per-process.
      runHashTtlS: 100 * 24 * 60 * 60,
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

        // ioredis pipelines concurrent commands on one connection, so this is safe at any org count
        await Promise.all(
          orgIds.map((orgId) =>
            queueService.queue(
              QueueName.IntegrationDeprecationNotice,
              QueueJobs.SendIntegrationDeprecationNotice,
              { orgId, period },
              {
                jobId: `integration-deprecation-notice-${orgId}-${period}`,
                removeOnComplete: true,
                removeOnFail: true
              }
            )
          )
        );
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
