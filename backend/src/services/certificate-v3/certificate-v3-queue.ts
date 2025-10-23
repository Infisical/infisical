/* eslint-disable no-await-in-loop */
import { EventType, TAuditLogServiceFactory } from "@app/ee/services/audit-log/audit-log-types";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";

import { ActorType } from "../auth/auth-type";
import { TCertificateDALFactory } from "../certificate/certificate-dal";
import { CertStatus } from "../certificate/certificate-types";
import { TCertificateAuthorityDALFactory } from "../certificate-authority/certificate-authority-dal";
import { CERTIFICATE_RENEWAL_CONFIG } from "../certificate-common/certificate-constants";
import { TCertificateProfileDALFactory } from "../certificate-profile/certificate-profile-dal";
import { TProjectDALFactory } from "../project/project-dal";
import { TCertificateV3ServiceFactory } from "./certificate-v3-service";

type TCertificateV3QueueServiceFactoryDep = {
  queueService: TQueueServiceFactory;
  certificateDAL: TCertificateDALFactory;
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "findByIdWithAssociatedCa">;
  certificateProfileDAL: Pick<TCertificateProfileDALFactory, "findByIdWithConfigs">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  certificateV3Service: TCertificateV3ServiceFactory;
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
};

export const certificateV3QueueServiceFactory = ({
  queueService,
  certificateDAL,
  certificateAuthorityDAL,
  certificateProfileDAL,
  projectDAL,
  certificateV3Service,
  auditLogService
}: TCertificateV3QueueServiceFactoryDep) => {
  queueService.start(QueueName.CertificateV3AutoRenewal, async (job) => {
    if (job.name === QueueJobs.CertificateV3DailyAutoRenewal) {
      logger.info(`${QueueJobs.CertificateV3DailyAutoRenewal}: queue task started`);

      const { QUEUE_BATCH_SIZE } = CERTIFICATE_RENEWAL_CONFIG;
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const certificates = await certificateDAL.find(
          {
            $notNull: ["profileId"],
            status: CertStatus.ACTIVE,
            renewedById: null,
            renewalError: null,
            revokedAt: null
          },
          {
            limit: QUEUE_BATCH_SIZE,
            offset
          }
        );

        if (certificates.length === 0) {
          hasMore = false;
          break;
        }

        await Promise.all(
          certificates.map(async (certificate) => {
            try {
              if (!certificate.profileId || !certificate.notAfter) {
                return;
              }

              const profile = await certificateProfileDAL.findByIdWithConfigs(certificate.profileId);
              if (!profile) {
                logger.warn(`Profile not found for certificate ${certificate.id}`);
                return;
              }

              const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(profile.caId);
              if (!ca) {
                logger.warn(`CA not found for certificate ${certificate.id}`);
                return;
              }

              const profileAutoRenewEnabled = profile.apiConfig?.autoRenew === true;
              const certificateHasRenewalConfig =
                certificate.renewBeforeDays != null && certificate.renewBeforeDays > 0;

              if (!profileAutoRenewEnabled && !certificateHasRenewalConfig) {
                return;
              }

              const now = new Date();
              if (certificate.notAfter <= now) {
                return;
              }

              const renewBeforeDays = certificate.renewBeforeDays || profile.apiConfig?.renewBeforeDays;
              if (!renewBeforeDays) {
                return;
              }

              const { MIN_RENEW_BEFORE_DAYS, MAX_RENEW_BEFORE_DAYS } = CERTIFICATE_RENEWAL_CONFIG;
              if (renewBeforeDays < MIN_RENEW_BEFORE_DAYS || renewBeforeDays > MAX_RENEW_BEFORE_DAYS) {
                logger.warn(`Invalid renewal threshold ${renewBeforeDays} for certificate ${certificate.id}`);
                return;
              }

              const expiryDate = new Date(certificate.notAfter);
              const renewalDate = new Date(expiryDate.getTime() - renewBeforeDays * 24 * 60 * 60 * 1000);

              const shouldRenew = renewalDate <= now;

              if (shouldRenew) {
                logger.info(`Auto-renewing certificate ${certificate.id} (common name: ${certificate.commonName})`);

                const project = await projectDAL.findById(certificate.projectId);
                if (!project) {
                  logger.error(`Project not found for certificate ${certificate.id}`);
                  return;
                }

                await certificateV3Service.renewCertificate({
                  actor: ActorType.PLATFORM,
                  actorId: "",
                  actorAuthMethod: null,
                  actorOrgId: project.orgId,
                  certificateId: certificate.id,
                  internal: true
                });

                await certificateDAL.updateById(certificate.id, {
                  renewalError: null
                });

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
                      profileId: certificate.profileId,
                      renewBeforeDays: certificate.renewBeforeDays?.toString() || ""
                    }
                  }
                });

                logger.info(`Successfully auto-renewed certificate ${certificate.id}`);
              }
            } catch (error) {
              logger.error(
                error,
                `Failed to auto-renew certificate ${certificate.id} (common name: ${certificate.commonName})`
              );

              const errorMessage = error instanceof Error ? error.message : "Unknown error";
              let categorizedError = errorMessage;

              if (errorMessage.includes("Template validation failed")) {
                categorizedError =
                  "Auto-renewal failed: certificate template policy has changed and this certificate no longer meets the requirements";
              } else if (errorMessage.includes("Certificate Authority") && errorMessage.includes("not found")) {
                categorizedError =
                  "Auto-renewal failed: Certificate Authority for this certificate is no longer available";
              } else if (errorMessage.includes("Certificate Authority is") && errorMessage.includes("must be ACTIVE")) {
                categorizedError = "Auto-renewal failed: Certificate Authority is currently inactive";
              } else if (errorMessage.includes("would expire") && errorMessage.includes("after its issuing CA")) {
                categorizedError = "Auto-renewal failed: certificate would outlive the Certificate Authority";
              } else if (
                errorMessage.includes("TTL") &&
                errorMessage.includes("must be greater than renewal threshold")
              ) {
                categorizedError =
                  "Auto-renewal failed: certificate validity period is too short for the renewal threshold";
              } else if (errorMessage.includes("not eligible for renewal")) {
                categorizedError = "Auto-renewal failed: certificate is not eligible for automatic renewal";
              } else if (errorMessage.includes("Requested validity period exceeds maximum allowed duration")) {
                categorizedError =
                  "Auto-renewal failed: certificate validity period exceeds the maximum allowed by the profile template";
              } else if (errorMessage.includes("not allowed by template policy")) {
                categorizedError =
                  "Auto-renewal failed: certificate settings are no longer allowed by the profile template";
              } else {
                categorizedError = `Auto-renewal failed: ${errorMessage}`;
              }

              try {
                await certificateDAL.updateById(certificate.id, {
                  renewalError: categorizedError
                });
              } catch (updateError) {
                logger.error(updateError, `Failed to update renewal error for certificate ${certificate.id}`);
              }

              try {
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
                      error: categorizedError
                    }
                  }
                });
              } catch (auditError) {
                logger.error(auditError, `Failed to create audit log for failed certificate renewal ${certificate.id}`);
              }
            }
          })
        );

        offset += QUEUE_BATCH_SIZE;
      }

      logger.info(`${QueueJobs.CertificateV3DailyAutoRenewal}: queue task completed`);
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
