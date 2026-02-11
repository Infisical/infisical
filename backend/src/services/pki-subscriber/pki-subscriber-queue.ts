import { EventType, TAuditLogServiceFactory } from "@app/ee/services/audit-log/audit-log-types";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";

import { ActorType } from "../auth/auth-type";
import { TCertificateDALFactory } from "../certificate/certificate-dal";
import { TCertificateAuthorityDALFactory } from "../certificate-authority/certificate-authority-dal";
import { CaStatus, CaType } from "../certificate-authority/certificate-authority-enums";
import { TCertificateAuthorityQueueFactory } from "../certificate-authority/certificate-authority-queue";
import { InternalCertificateAuthorityFns } from "../certificate-authority/internal/internal-certificate-authority-fns";
import { TPkiSubscriberDALFactory } from "./pki-subscriber-dal";
import { PkiSubscriberStatus, SubscriberOperationStatus } from "./pki-subscriber-types";

type TPkiSubscriberQueueServiceFactoryDep = {
  queueService: TQueueServiceFactory;
  pkiSubscriberDAL: TPkiSubscriberDALFactory;
  certificateAuthorityDAL: TCertificateAuthorityDALFactory;
  certificateAuthorityQueue: TCertificateAuthorityQueueFactory;
  internalCaFns: ReturnType<typeof InternalCertificateAuthorityFns>;
  certificateDAL: TCertificateDALFactory;
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
};

export const pkiSubscriberQueueServiceFactory = ({
  queueService,
  pkiSubscriberDAL,
  certificateAuthorityDAL,
  certificateAuthorityQueue,
  internalCaFns,
  certificateDAL,
  auditLogService
}: TPkiSubscriberQueueServiceFactoryDep) => {
  queueService.start(QueueName.PkiSubscriber, async (job) => {
    if (job.name === QueueJobs.PkiSubscriberDailyAutoRenewal) {
      logger.info(`${QueueJobs.PkiSubscriberDailyAutoRenewal}: queue task started`);

      const BATCH_SIZE = 100;
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        // fetch PKI subscribers with auto renewal enabled in batches
        // eslint-disable-next-line no-await-in-loop
        const pkiSubscribers = await pkiSubscriberDAL.find(
          {
            enableAutoRenewal: true,
            $notNull: ["autoRenewalPeriodInDays"],
            status: PkiSubscriberStatus.ACTIVE
          },
          {
            limit: BATCH_SIZE,
            offset
          }
        );

        if (pkiSubscribers.length === 0) {
          hasMore = false;
          break;
        }

        // Process each subscriber in the batch concurrently
        // eslint-disable-next-line no-await-in-loop
        await Promise.all(
          pkiSubscribers.map(async (subscriber) => {
            try {
              const cert = await certificateDAL.findLatestActiveCertForSubscriber({ subscriberId: subscriber.id });
              let shouldRenew = false;
              if (!cert || !cert.notAfter) {
                shouldRenew = true;
              } else {
                const now = new Date();
                const expiry = new Date(cert.notAfter);
                const daysUntilExpiry = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
                shouldRenew = daysUntilExpiry <= subscriber.autoRenewalPeriodInDays!;
              }

              if (shouldRenew) {
                // Get the CA for the subscriber
                if (!subscriber.caId) {
                  await pkiSubscriberDAL.updateById(subscriber.id, {
                    lastOperationStatus: SubscriberOperationStatus.FAILED,
                    lastOperationMessage: "No CA assigned to subscriber",
                    lastOperationAt: new Date()
                  });
                  return;
                }

                const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(subscriber.caId);
                if (!ca) {
                  await pkiSubscriberDAL.updateById(subscriber.id, {
                    lastOperationStatus: SubscriberOperationStatus.FAILED,
                    lastOperationMessage: "CA not found",
                    lastOperationAt: new Date()
                  });
                  return;
                }

                // Check if CA is active
                if (ca.status !== CaStatus.ACTIVE) {
                  await pkiSubscriberDAL.updateById(subscriber.id, {
                    lastOperationStatus: SubscriberOperationStatus.FAILED,
                    lastOperationMessage: "CA is not active",
                    lastOperationAt: new Date()
                  });
                  return;
                }
                // Order new certificate based on CA type
                if (ca.externalCa?.id && ca.externalCa.type === CaType.ACME) {
                  await certificateAuthorityQueue.orderCertificateForSubscriber({
                    subscriberId: subscriber.id,
                    caType: ca.externalCa.type
                  });
                } else if (ca.internalCa?.id) {
                  // For internal CAs, we can issue certificates directly
                  await internalCaFns.issueCertificate(subscriber, ca);
                }

                // Update last auto-renew timestamp
                await pkiSubscriberDAL.updateById(subscriber.id, {
                  lastAutoRenewAt: new Date(),
                  lastOperationStatus: SubscriberOperationStatus.SUCCESS,
                  lastOperationMessage: "Triggered certificate auto-renewal",
                  lastOperationAt: new Date()
                });

                await auditLogService.createAuditLog({
                  projectId: subscriber.projectId,
                  actor: {
                    type: ActorType.PLATFORM,
                    metadata: {}
                  },
                  event: {
                    type: EventType.AUTOMATED_RENEW_SUBSCRIBER_CERT,
                    metadata: {
                      subscriberId: subscriber.id,
                      name: subscriber.name
                    }
                  }
                });
              }
            } catch (error) {
              // Log error and update subscriber status
              logger.error(error, `Failed to auto-renew certificate for subscriber ${subscriber.id}`);
              await pkiSubscriberDAL.updateById(subscriber.id, {
                lastOperationStatus: SubscriberOperationStatus.FAILED,
                lastOperationMessage: error instanceof Error ? error.message : "Unknown error",
                lastOperationAt: new Date()
              });
            }
          })
        );

        offset += BATCH_SIZE;
      }

      logger.info(`${QueueJobs.PkiSubscriberDailyAutoRenewal}: queue task completed`);
    }
  });

  // we do a repeat cron job in utc timezone at 12 Midnight each day
  const startDailyAutoRenewalJob = async () => {
    // clear previous job
    await queueService.stopRepeatableJob(
      QueueName.PkiSubscriber,
      QueueJobs.PkiSubscriberDailyAutoRenewal,
      { pattern: "0 0 * * *", utc: true },
      // { pattern: "*/30 * * * * *", utc: true } // for testing
      QueueName.PkiSubscriber // just a job id
    );

    await queueService.queue(QueueName.PkiSubscriber, QueueJobs.PkiSubscriberDailyAutoRenewal, undefined, {
      delay: 5000,
      jobId: QueueName.PkiSubscriber,
      // { pattern: "*/30 * * * * *", utc: true } // for testing
      repeat: { pattern: "0 0 * * *", utc: true, key: QueueName.PkiSubscriber }
    });
  };

  queueService.listen(QueueName.PkiSubscriber, "failed", (_, err) => {
    logger.error(err, `${QueueName.PkiSubscriber}: failed`);
  });

  return {
    startDailyAutoRenewalJob
  };
};
