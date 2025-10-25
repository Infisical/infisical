/* eslint-disable no-await-in-loop */
import { EventType, TAuditLogServiceFactory } from "@app/ee/services/audit-log/audit-log-types";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";

import { ActorType } from "../auth/auth-type";
import { TCertificateDALFactory } from "../certificate/certificate-dal";
import { CERTIFICATE_RENEWAL_CONFIG } from "../certificate-common/certificate-constants";
import { TCertificateV3ServiceFactory } from "./certificate-v3-service";

type TCertificateV3QueueServiceFactoryDep = {
  queueService: TQueueServiceFactory;
  certificateDAL: Pick<TCertificateDALFactory, "findCertificatesEligibleForRenewal" | "updateById">;
  certificateV3Service: TCertificateV3ServiceFactory;
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
};

export const certificateV3QueueServiceFactory = ({
  queueService,
  certificateDAL,
  certificateV3Service,
  auditLogService
}: TCertificateV3QueueServiceFactoryDep) => {
  queueService.start(QueueName.CertificateV3AutoRenewal, async (job) => {
    if (job.name === QueueJobs.CertificateV3DailyAutoRenewal) {
      logger.info(`${QueueJobs.CertificateV3DailyAutoRenewal}: queue task started`);

      const { QUEUE_BATCH_SIZE } = CERTIFICATE_RENEWAL_CONFIG;
      let offset = 0;
      let hasMore = true;
      let totalCertificatesFound = 0;
      let totalCertificatesRenewed = 0;

      while (hasMore) {
        const certificates = await certificateDAL.findCertificatesEligibleForRenewal({
          limit: QUEUE_BATCH_SIZE,
          offset
        });

        if (certificates.length === 0) {
          hasMore = false;
          break;
        }

        totalCertificatesFound += certificates.length;
        logger.info(
          `${QueueJobs.CertificateV3DailyAutoRenewal}: found ${certificates.length} certificates eligible for renewal (batch ${Math.floor(offset / QUEUE_BATCH_SIZE) + 1}, total found so far: ${totalCertificatesFound})`
        );

        for (const certificate of certificates) {
          try {
            if (certificate.renewBeforeDays) {
              const { MIN_RENEW_BEFORE_DAYS, MAX_RENEW_BEFORE_DAYS } = CERTIFICATE_RENEWAL_CONFIG;
              if (
                certificate.renewBeforeDays < MIN_RENEW_BEFORE_DAYS ||
                certificate.renewBeforeDays > MAX_RENEW_BEFORE_DAYS
              ) {
                // eslint-disable-next-line no-continue
                continue;
              }
            }

            await certificateV3Service.renewCertificate({
              actor: ActorType.PLATFORM,
              actorId: "",
              actorAuthMethod: null,
              actorOrgId: "",
              certificateId: certificate.id,
              internal: true
            });

            totalCertificatesRenewed += 1;

            await auditLogService.createAuditLog({
              projectId: certificate.projectId,
              actor: {
                type: ActorType.PLATFORM,
                metadata: {}
              },
              event: {
                type: EventType.AUTOMATED_RENEW_CERTIFICATE,
                metadata: {
                  certificateId: certificate.id,
                  commonName: certificate.commonName || "",
                  profileId: certificate.profileId!,
                  renewBeforeDays: certificate.renewBeforeDays?.toString() || "",
                  profileName: certificate.profileName || ""
                }
              }
            });
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error(error, `Failed to renew certificate ${certificate.id}: ${errorMessage}`);
            await auditLogService.createAuditLog({
              projectId: certificate.projectId,
              actor: {
                type: ActorType.PLATFORM,
                metadata: {}
              },
              event: {
                type: EventType.AUTOMATED_RENEW_CERTIFICATE_FAILED,
                metadata: {
                  certificateId: certificate.id,
                  commonName: certificate.commonName || "",
                  profileId: certificate.profileId || "",
                  renewBeforeDays: certificate.renewBeforeDays?.toString() || "",
                  profileName: certificate.profileName || "",
                  error: errorMessage
                }
              }
            });
          }
        }

        offset += QUEUE_BATCH_SIZE;
      }

      logger.info(
        `${QueueJobs.CertificateV3DailyAutoRenewal}: queue task completed. Renewed ${totalCertificatesRenewed} certificates out of ${totalCertificatesFound}`
      );
    }
  });

  const startDailyAutoRenewalJob = async () => {
    const { DAILY_CRON_SCHEDULE, QUEUE_START_DELAY_MS } = CERTIFICATE_RENEWAL_CONFIG;

    await queueService.stopRepeatableJob(
      QueueName.CertificateV3AutoRenewal,
      QueueJobs.CertificateV3DailyAutoRenewal,
      { pattern: DAILY_CRON_SCHEDULE, utc: true },
      QueueName.CertificateV3AutoRenewal
    );

    await queueService.queue(QueueName.CertificateV3AutoRenewal, QueueJobs.CertificateV3DailyAutoRenewal, undefined, {
      delay: QUEUE_START_DELAY_MS,
      jobId: QueueName.CertificateV3AutoRenewal,
      repeat: { pattern: DAILY_CRON_SCHEDULE, utc: true }
    });
  };

  queueService.listen(QueueName.CertificateV3AutoRenewal, "failed", (_, err) => {
    logger.error(err, `${QueueName.CertificateV3AutoRenewal}: failed`);
  });

  return {
    startDailyAutoRenewalJob
  };
};

export type TCertificateV3QueueFactory = ReturnType<typeof certificateV3QueueServiceFactory>;
