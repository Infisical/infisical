/* eslint-disable no-await-in-loop, no-continue */
import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { CronJobName, TCronJobFactory } from "@app/lib/cron/cron-job";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import { CertStatus } from "@app/services/certificate/certificate-types";
import { DEFAULT_CRL_VALIDITY_DAYS } from "@app/services/certificate-common/certificate-constants";
import type { THsmConnectorServiceFactory } from "@app/services/hsm-connector/hsm-connector-service";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { getProjectKmsCertificateKeyId } from "@app/services/project/project-fns";

import { TCertificateAuthorityCrlDALFactory } from "../../ee/services/certificate-authority-crl/certificate-authority-crl-dal";
import { TAppConnectionDALFactory } from "../app-connection/app-connection-dal";
import { TAppConnectionServiceFactory } from "../app-connection/app-connection-service";
import { TCertificateBodyDALFactory } from "../certificate/certificate-body-dal";
import { TCertificateSecretDALFactory } from "../certificate/certificate-secret-dal";
import { TPkiSubscriberDALFactory } from "../pki-subscriber/pki-subscriber-dal";
import { SubscriberOperationStatus } from "../pki-subscriber/pki-subscriber-types";
import { TPkiSyncDALFactory } from "../pki-sync/pki-sync-dal";
import { TPkiSyncQueueFactory } from "../pki-sync/pki-sync-queue";
import { AcmeCertificateAuthorityFns } from "./acme/acme-certificate-authority-fns";
import { AzureAdCsCertificateAuthorityFns } from "./azure-ad-cs/azure-ad-cs-certificate-authority-fns";
import { TCertificateAuthorityDALFactory } from "./certificate-authority-dal";
import { CaType } from "./certificate-authority-enums";
import { getCaSigner } from "./certificate-authority-fns";
import { TCertificateAuthoritySecretDALFactory } from "./certificate-authority-secret-dal";
import { TExternalCertificateAuthorityDALFactory } from "./external-certificate-authority-dal";
import { TInternalCertificateAuthorityDALFactory } from "./internal/internal-certificate-authority-dal";
import { TOrderCertificateForSubscriberDTO } from "./internal/internal-certificate-authority-types";

type TCertificateAuthorityQueueFactoryDep = {
  certificateAuthorityDAL: TCertificateAuthorityDALFactory;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById" | "update" | "updateById">;
  appConnectionService: Pick<TAppConnectionServiceFactory, "validateAppConnectionUsageById">;
  externalCertificateAuthorityDAL: Pick<TExternalCertificateAuthorityDALFactory, "create" | "update" | "findOne">;
  keyStore: Pick<TKeyStoreFactory, "acquireLock" | "setItemWithExpiry" | "getItem">;
  certificateAuthorityCrlDAL: TCertificateAuthorityCrlDALFactory;
  certificateAuthoritySecretDAL: TCertificateAuthoritySecretDALFactory;
  certificateDAL: TCertificateDALFactory;
  projectDAL: Pick<TProjectDALFactory, "findProjectBySlug" | "findOne" | "updateById" | "findById" | "transaction">;
  kmsService: Pick<
    TKmsServiceFactory,
    "generateKmsKey" | "encryptWithKmsKey" | "decryptWithKmsKey" | "createCipherPairWithDataKey"
  >;
  certificateBodyDAL: Pick<TCertificateBodyDALFactory, "create">;
  certificateSecretDAL: Pick<TCertificateSecretDALFactory, "create">;
  queueService: TQueueServiceFactory;
  cronJob: TCronJobFactory;
  pkiSubscriberDAL: Pick<TPkiSubscriberDALFactory, "findById" | "updateById">;
  pkiSyncDAL: Pick<TPkiSyncDALFactory, "find">;
  pkiSyncQueue: Pick<TPkiSyncQueueFactory, "queuePkiSyncSyncCertificatesById">;
  internalCertificateAuthorityDAL: Pick<TInternalCertificateAuthorityDALFactory, "find">;
  hsmConnectorService: Pick<THsmConnectorServiceFactory, "sign">;
};

export type TCertificateAuthorityQueueFactory = ReturnType<typeof certificateAuthorityQueueFactory>;

export const certificateAuthorityQueueFactory = ({
  certificateAuthorityCrlDAL,
  certificateAuthorityDAL,
  certificateAuthoritySecretDAL,
  certificateDAL,
  projectDAL,
  kmsService,
  queueService,
  cronJob,
  keyStore,
  appConnectionDAL,
  appConnectionService,
  externalCertificateAuthorityDAL,
  certificateBodyDAL,
  certificateSecretDAL,
  pkiSubscriberDAL,
  pkiSyncDAL,
  pkiSyncQueue,
  internalCertificateAuthorityDAL,
  hsmConnectorService
}: TCertificateAuthorityQueueFactoryDep) => {
  const acmeFns = AcmeCertificateAuthorityFns({
    appConnectionDAL,
    appConnectionService,
    certificateAuthorityDAL,
    externalCertificateAuthorityDAL,
    certificateDAL,
    certificateBodyDAL,
    certificateSecretDAL,
    kmsService,
    pkiSubscriberDAL,
    projectDAL,
    pkiSyncDAL,
    pkiSyncQueue
  });

  const azureAdCsFns = AzureAdCsCertificateAuthorityFns({
    appConnectionDAL,
    appConnectionService,
    certificateAuthorityDAL,
    externalCertificateAuthorityDAL,
    certificateDAL,
    certificateBodyDAL,
    certificateSecretDAL,
    kmsService,
    pkiSubscriberDAL,
    projectDAL,
    pkiSyncDAL,
    pkiSyncQueue
  });

  const startCaCrlRebuildJob = () => {
    const appCfg = getConfig();
    // Daily at midnight UTC; only CRLs expiring before next run are rebuilt
    const cronPattern = appCfg.NODE_ENV === "development" ? "*/5 * * * *" : "0 0 * * *";

    cronJob.register({
      name: CronJobName.CaCrlRotation,
      pattern: cronPattern,
      runHashTtlS: 3 * 24 * 60 * 60,
      enabled: !appCfg.isSecondaryInstance,
      handler: async () => {
        logger.info(`${QueueJobs.CaCrlRotation}: starting CRL rebuild for all internal CAs`);

        const CRL_REBUILD_BATCH_SIZE = 100;
        let offset = 0;
        let totalRebuilt = 0;

        // Rebuild any CRL whose validity expires before the next daily run (~24h from now)
        const nextRunAt = new Date();
        nextRunAt.setDate(nextRunAt.getDate() + 1);

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const internalCas = await internalCertificateAuthorityDAL.find({}, { offset, limit: CRL_REBUILD_BATCH_SIZE });

          if (internalCas.length === 0) break;

          for (const internalCa of internalCas) {
            try {
              const caCrls = await certificateAuthorityCrlDAL.find(
                { caId: internalCa.caId },
                { sort: [["updatedAt", "desc"]], limit: 1 }
              );
              if (caCrls.length === 0) continue;

              // Skip if CRL was recently rebuilt and won't expire before next run
              const crlExpiresAt = new Date(caCrls[0].updatedAt);
              crlExpiresAt.setDate(crlExpiresAt.getDate() + DEFAULT_CRL_VALIDITY_DAYS);
              if (crlExpiresAt > nextRunAt) continue;

              const ca = await certificateAuthorityDAL.findById(internalCa.caId);

              const keyId = await getProjectKmsCertificateKeyId({
                projectId: ca.projectId,
                projectDAL,
                kmsService
              });

              const { signer } = await getCaSigner({
                caId: internalCa.caId,
                certificateAuthorityDAL,
                certificateAuthoritySecretDAL,
                projectDAL,
                kmsService,
                hsmConnectorService
              });

              const revokedCerts = await certificateDAL.find({
                caId: internalCa.caId,
                status: CertStatus.REVOKED
              });

              const thisUpdate = new Date();
              const nextUpdate = new Date(thisUpdate);
              nextUpdate.setDate(nextUpdate.getDate() + DEFAULT_CRL_VALIDITY_DAYS);

              const crl = await signer.createCrl({
                issuer: internalCa.dn,
                thisUpdate,
                nextUpdate,
                entries: revokedCerts.map((revokedCert) => ({
                  serialNumber: revokedCert.serialNumber,
                  revocationDate: new Date(revokedCert.revokedAt as Date),
                  reason: revokedCert.revocationReason as number
                }))
              });

              const kmsEncryptor = await kmsService.encryptWithKmsKey({ kmsId: keyId });
              const { cipherTextBlob: encryptedCrl } = await kmsEncryptor({
                plainText: Buffer.from(new Uint8Array(crl.rawData))
              });

              await certificateAuthorityCrlDAL.updateEncryptedCrlAndBumpUpdatedAt(
                { caId: internalCa.caId },
                { encryptedCrl }
              );
              totalRebuilt += 1;
            } catch (err) {
              logger.error(err, `${QueueJobs.CaCrlRotation}: failed to rebuild CRL [caId=${internalCa.caId}]`);
            }
          }

          if (internalCas.length < CRL_REBUILD_BATCH_SIZE) break;
          offset += CRL_REBUILD_BATCH_SIZE;
        }

        logger.info(`${QueueJobs.CaCrlRotation}: CRL rebuild completed, rebuilt ${totalRebuilt} CRLs`);
      }
    });
  };

  const orderCertificateForSubscriber = async ({ subscriberId, caType }: TOrderCertificateForSubscriberDTO) => {
    const entry = await keyStore.getItem(KeyStorePrefixes.CaOrderCertificateForSubscriberLock(subscriberId));
    if (entry) {
      throw new BadRequestError({ message: `Certificate order already in progress for subscriber ${subscriberId}` });
    }

    await queueService.queue(
      QueueName.CaLifecycle,
      QueueJobs.CaOrderCertificateForSubscriber,
      {
        subscriberId,
        caType
      },
      {
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: true,
        jobId: `ca-order-certificate-for-subscriber-${subscriberId}`
      }
    );
  };

  queueService.start(QueueName.CaLifecycle, async (job) => {
    if (job.name === QueueJobs.CaOrderCertificateForSubscriber) {
      const { subscriberId, caType } = job.data;
      let lock: Awaited<ReturnType<typeof keyStore.acquireLock>>;

      try {
        lock = await keyStore.acquireLock(
          [KeyStorePrefixes.CaOrderCertificateForSubscriberLock(subscriberId)],
          5 * 60 * 1000
        );
      } catch (e) {
        logger.info(`CaOrderCertificate Failed to acquire lock [subscriberId=${subscriberId}] [job=${job.name}]`);
        return;
      }

      try {
        if (caType === CaType.ACME) {
          await acmeFns.orderSubscriberCertificate(subscriberId);
          await pkiSubscriberDAL.updateById(subscriberId, {
            lastOperationStatus: SubscriberOperationStatus.SUCCESS,
            lastOperationMessage: "Certificate ordered successfully",
            lastOperationAt: new Date()
          });
        } else if (caType === CaType.AZURE_AD_CS) {
          await azureAdCsFns.orderSubscriberCertificate(subscriberId);
          await pkiSubscriberDAL.updateById(subscriberId, {
            lastOperationStatus: SubscriberOperationStatus.SUCCESS,
            lastOperationMessage: "Certificate ordered successfully",
            lastOperationAt: new Date()
          });
        }
      } catch (e: unknown) {
        if (e instanceof Error) {
          await pkiSubscriberDAL.updateById(subscriberId, {
            lastOperationStatus: SubscriberOperationStatus.FAILED,
            lastOperationMessage: e.message,
            lastOperationAt: new Date()
          });
        }
        logger.error(e, `CaOrderCertificate Failed [subscriberId=${subscriberId}] [job=${job.name}]`);
      } finally {
        await lock.release();
      }
    }
  });

  return {
    startCaCrlRebuildJob,
    orderCertificateForSubscriber
  };
};
