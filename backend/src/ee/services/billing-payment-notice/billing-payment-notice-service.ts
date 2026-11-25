import { OrgMembershipRole, OrgMembershipStatus } from "@app/db/schemas";
import { TLicenseServerBilling, TPaymentFailure } from "@app/domains/platform/license/ce/module";
import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { CronJobName, TCronJobFactory } from "@app/lib/cron/cron-job";
import { logger } from "@app/lib/logger";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { SmtpTemplates, TSmtpService } from "@app/services/smtp/smtp-service";

type TBillingPaymentNoticeServiceFactoryDep = {
  licenseBilling: Pick<TLicenseServerBilling, "isEnabled" | "listPaymentFailures">;
  orgDAL: Pick<TOrgDALFactory, "findOrgById" | "findOrgMembersByRole">;
  smtpService: Pick<TSmtpService, "sendMail">;
  keyStore: Pick<TKeyStoreFactory, "setItemWithExpiryNX" | "deleteItem">;
  cronJob: Pick<TCronJobFactory, "register">;
};

export type TBillingPaymentNoticeServiceFactory = ReturnType<typeof billingPaymentNoticeServiceFactory>;

const DAY_MS = 24 * 60 * 60 * 1000;

// Ascending. A failure first seen late gets only the stage it has reached, never the ones it skipped.
const STAGES = [
  {
    key: "first",
    afterMs: 0,
    subjectLine: "Payment Failed for Your Infisical Subscription"
  },
  {
    key: "reminder",
    afterMs: 3 * DAY_MS,
    subjectLine: "Reminder: Payment Failed for Your Infisical Subscription"
  },
  {
    key: "final",
    afterMs: 7 * DAY_MS,
    subjectLine: "Final Reminder: Payment Failed for Your Infisical Subscription"
  }
] as const;

// Outlives Stripe's retry schedule, so one failed invoice never repeats a stage.
const SENT_MARKER_TTL_S = 60 * 24 * 60 * 60;

const parseDate = (value: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

// Stripe emails only the billing contact, who may have left. This tells the org's current admins a renewal failed.
export const billingPaymentNoticeServiceFactory = ({
  licenseBilling,
  orgDAL,
  smtpService,
  keyStore,
  cronJob
}: TBillingPaymentNoticeServiceFactoryDep) => {
  const sendEmail = async (failure: TPaymentFailure, stage: (typeof STAGES)[number], failedAt: Date | null) => {
    // The License Server lists every region's orgs, so one missing here belongs to another region.
    const org = await orgDAL.findOrgById(failure.orgId);
    if (!org) return;

    const recipients = (await orgDAL.findOrgMembersByRole(failure.orgId, OrgMembershipRole.Admin))
      .filter((admin) => admin.status !== OrgMembershipStatus.Invited && admin.user.isActive)
      .map((admin) => admin.user.email)
      .filter((email): email is string => Boolean(email));
    if (!recipients.length) {
      logger.info(`billingPaymentNotice: no admins to email [orgId=${failure.orgId}]`);
      return;
    }

    const { SITE_URL } = getConfig();
    await smtpService.sendMail({
      template: SmtpTemplates.BillingPaymentFailed,
      subjectLine: stage.subjectLine,
      recipients,
      substitutions: {
        orgName: org.name,
        url: `${SITE_URL}/organizations/${failure.orgId}/billing`,
        needsAction: failure.needsAction,
        isFinalReminder: stage.key === "final",
        failedAt
      }
    });
    logger.info(
      `billingPaymentNotice: emailed admins [orgId=${failure.orgId}] [stage=${stage.key}] [recipients=${recipients.length}]`
    );
  };

  // The marker is claimed before sending and dropped when the send fails, so the next run retries that stage.
  const notifyOne = async (failure: TPaymentFailure, now: number) => {
    const failedAt = parseDate(failure.since);
    const ageMs = failedAt ? now - failedAt.getTime() : 0;
    const stage = [...STAGES].reverse().find((candidate) => ageMs >= candidate.afterMs) ?? STAGES[0];

    const episode = failure.invoiceId ?? failedAt?.toISOString() ?? "unknown";
    const marker = KeyStorePrefixes.BillingPaymentNoticeSent(failure.orgId, episode, stage.key);
    const claimed = await keyStore.setItemWithExpiryNX(marker, SENT_MARKER_TTL_S, "1");
    if (!claimed) return;

    try {
      await sendEmail(failure, stage, failedAt);
    } catch (error) {
      logger.error(error, `billingPaymentNotice: failed to send email [orgId=${failure.orgId}] [stage=${stage.key}]`);
      await keyStore
        .deleteItem(marker)
        .catch((releaseError) =>
          logger.error(releaseError, `billingPaymentNotice: failed to release marker [orgId=${failure.orgId}]`)
        );
    }
  };

  const notifyPaymentFailures = async () => {
    const failures = await licenseBilling.listPaymentFailures();
    const now = Date.now();
    for (const failure of failures) {
      // One org at a time keeps a backlog of failures from flooding the mail server.
      // eslint-disable-next-line no-await-in-loop
      await notifyOne(failure, now);
    }
  };

  const init = () => {
    const appCfg = getConfig();
    cronJob.register({
      name: CronJobName.BillingPaymentFailureNotice,
      pattern: "0 * * * *",
      runHashTtlS: 60 * 60,
      // Self-hosted licenses are invoiced out of band: there is no Stripe subscription to fail.
      enabled: appCfg.isCloud && !appCfg.isSecondaryInstance && licenseBilling.isEnabled(),
      handler: notifyPaymentFailures
    });
  };

  return { init, notifyPaymentFailures };
};
