/* eslint-disable no-await-in-loop, no-continue */
import { CronJobName, TCronJobFactory } from "@app/lib/cron/cron-job";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";

import { TSignerDALFactory } from "./signer-dal";
import { SignerStatus } from "./signer-enums";
import { TSignerServiceFactory } from "./signer-service";

type TSignerAutoRenewalQueueFactoryDep = {
  queueService: TQueueServiceFactory;
  cronJob: TCronJobFactory;
  signerDAL: Pick<TSignerDALFactory, "findByStatusWithCertificate">;
  signerService: Pick<TSignerServiceFactory, "autoRenewCertificate">;
};

export type TSignerAutoRenewalQueueFactory = ReturnType<typeof signerAutoRenewalQueueFactory>;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const signerAutoRenewalQueueFactory = ({
  queueService,
  cronJob,
  signerDAL,
  signerService
}: TSignerAutoRenewalQueueFactoryDep) => {
  queueService.start(QueueName.SignerAutoRenewal, async (job) => {
    if (job.name !== QueueJobs.SignerDailyAutoRenewal) return;

    const now = Date.now();
    const candidates = await signerDAL.findByStatusWithCertificate(SignerStatus.Active);

    let scanned = 0;
    let needsRenewal = 0;
    let renewed = 0;
    let unrenewable = 0;
    let failed = 0;

    for (const signer of candidates) {
      scanned += 1;

      if (!signer.certificateRenewBeforeDays || signer.certificateRenewBeforeDays < 1) continue;

      if (!signer.caId) {
        unrenewable += 1;
        logger.warn(
          { signerId: signer.id, signerName: signer.name },
          `signer auto-renewal: skipping signer '${signer.name}' [signerId=${signer.id}] — no CA configured for renewal (likely migrated from an imported certificate)`
        );
        continue;
      }

      if (!signer.certificateNotAfter) {
        needsRenewal += 1;
        try {
          await signerService.autoRenewCertificate(signer.id);
          renewed += 1;
        } catch (err) {
          failed += 1;
          logger.error(err, `signer auto-renewal: renewal failed for signer '${signer.name}' [signerId=${signer.id}]`);
        }
        continue;
      }

      const msUntilExpiry = new Date(signer.certificateNotAfter).getTime() - now;
      const daysUntilExpiry = msUntilExpiry / MS_PER_DAY;
      const isDue = daysUntilExpiry <= signer.certificateRenewBeforeDays;
      if (!isDue) continue;

      needsRenewal += 1;
      logger.info(
        {
          signerId: signer.id,
          signerName: signer.name,
          caId: signer.caId,
          daysUntilExpiry: Math.round(daysUntilExpiry * 100) / 100
        },
        `signer auto-renewal: renewing '${signer.name}' [signerId=${signer.id}] [caId=${signer.caId}]`
      );

      try {
        await signerService.autoRenewCertificate(signer.id);
        renewed += 1;
      } catch (err) {
        failed += 1;
        logger.error(err, `signer auto-renewal: renewal failed for signer '${signer.name}' [signerId=${signer.id}]`);
      }
    }

    logger.info(
      { scanned, needsRenewal, renewed, unrenewable, failed, elapsedMs: Date.now() - now },
      `signer auto-renewal cron completed [scanned=${scanned}] [needsRenewal=${needsRenewal}] [renewed=${renewed}] [unrenewable=${unrenewable}] [failed=${failed}]`
    );
  });

  queueService.listen(QueueName.SignerAutoRenewal, "failed", (_, err) => {
    logger.error(err, `${QueueName.SignerAutoRenewal}: job failed`);
  });

  const start = () => {
    cronJob.register({
      name: CronJobName.SignerDailyAutoRenewal,
      pattern: "10 0 * * *",
      runHashTtlS: 3 * 24 * 60 * 60,
      handler: async () => {
        await queueService.queue(QueueName.SignerAutoRenewal, QueueJobs.SignerDailyAutoRenewal, undefined as never, {
          jobId: CronJobName.SignerDailyAutoRenewal
        });
      }
    });
  };

  return { start };
};
