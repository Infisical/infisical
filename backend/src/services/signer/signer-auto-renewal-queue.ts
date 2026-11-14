/* eslint-disable no-await-in-loop, no-continue */
import { CronJobName, TCronJobFactory } from "@app/lib/cron/cron-job";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";

import { TSignerDALFactory } from "./signer-dal";
import { SignerAutoRenewalOutcome, SignerStatus } from "./signer-enums";
import { TSignerServiceFactory } from "./signer-service";

type TSignerAutoRenewalQueueFactoryDep = {
  queueService: TQueueServiceFactory;
  cronJob: TCronJobFactory;
  signerDAL: Pick<TSignerDALFactory, "findByStatusWithCertificate">;
  signerService: Pick<TSignerServiceFactory, "autoRenewCertificate" | "syncPendingRevocations">;
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
    const counts: Record<SignerAutoRenewalOutcome, number> = {
      [SignerAutoRenewalOutcome.Renewed]: 0,
      [SignerAutoRenewalOutcome.Skipped]: 0,
      [SignerAutoRenewalOutcome.Failed]: 0
    };
    let due = 0;

    for (const signer of candidates) {
      const renewBeforeDays = signer.certificateRenewBeforeDays ?? 0;
      const isDue =
        renewBeforeDays >= 1 &&
        (!signer.certificateNotAfter ||
          new Date(signer.certificateNotAfter).getTime() - now <= renewBeforeDays * MS_PER_DAY);
      if (!isDue) continue;

      due += 1;
      try {
        counts[await signerService.autoRenewCertificate(signer.id)] += 1;
      } catch (err) {
        counts[SignerAutoRenewalOutcome.Failed] += 1;
        logger.error(err, `signer auto-renewal: renewal failed for signer '${signer.name}' [signerId=${signer.id}]`);
      }
    }

    logger.info(
      { scanned: candidates.length, due, ...counts, elapsedMs: Date.now() - now },
      `signer auto-renewal cron completed [scanned=${candidates.length}] [due=${due}] [renewed=${counts.renewed}] [skipped=${counts.skipped}] [failed=${counts.failed}]`
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
    cronJob.register({
      name: CronJobName.SignerPendingRevocationSync,
      pattern: "*/15 * * * *",
      runHashTtlS: 15 * 60,
      handler: () => signerService.syncPendingRevocations()
    });
  };

  return { start };
};
