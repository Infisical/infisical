/* eslint-disable no-await-in-loop */
import { EventType, TAuditLogServiceFactory } from "@app/ee/services/audit-log/audit-log-types";
import { getConfig } from "@app/lib/config/env";
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
  const appCfg = getConfig();

  const init = async () => {
    if (appCfg.isSecondaryInstance) {
      return;
    }

    await queueService.stopRepeatableJob(
      QueueName.CertificateV3AutoRenewal,
      QueueJobs.CertificateV3DailyAutoRenewal,
      { pattern: CERTIFICATE_RENEWAL_CONFIG.DAILY_CRON_SCHEDULE, utc: true },
      QueueName.CertificateV3AutoRenewal
    );

    queueService.start(QueueName.CertificateV3AutoRenewal, async () => {
      try {
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
      } catch (error) {
        logger.error(error, `${QueueJobs.CertificateV3DailyAutoRenewal}: certificate renewal failed`);
        throw error;
      }
    });

    await queueService.schedulePg(
      QueueJobs.CertificateV3DailyAutoRenewal,
      CERTIFICATE_RENEWAL_CONFIG.DAILY_CRON_SCHEDULE,
      undefined,
      { tz: "UTC" }
    );
  };

  return {
    init
  };
};

export type TCertificateV3QueueServiceFactory = ReturnType<typeof certificateV3QueueServiceFactory>;
