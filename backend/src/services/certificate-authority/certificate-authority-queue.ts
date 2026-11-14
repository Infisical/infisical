import { TKmsDataKeyService, TKmsKeyService } from "@app/domains/platform/kms-core/ce/module";
/* eslint-disable no-await-in-loop */
import { TAuditLogServiceFactory } from "@app/ee/services/audit-log/audit-log-types";
import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { CronJobName, TCronJobFactory } from "@app/lib/cron/cron-job";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";
import type { TCaKeySourceServiceFactory } from "@app/services/certificate-authority/ca-key-source/ca-key-source-service";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";

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
import { TCertificateAuthorityCertDALFactory } from "./certificate-authority-cert-dal";
import { TCertificateAuthorityDALFactory } from "./certificate-authority-dal";
import { CaCrlRegenerationTrigger, CaType } from "./certificate-authority-enums";
import { rebuildCaCrl } from "./certificate-authority-fns";
import { TCertificateAuthoritySecretDALFactory } from "./certificate-authority-secret-dal";
import { TExternalCertificateAuthorityDALFactory } from "./external-certificate-authority-dal";
import { TOrderCertificateForSubscriberDTO } from "./internal/internal-certificate-authority-types";

type TCertificateAuthorityQueueFactoryDep = {
  certificateAuthorityDAL: TCertificateAuthorityDALFactory;
  certificateAuthorityCertDAL: Pick<TCertificateAuthorityCertDALFactory, "findById">;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById" | "update" | "updateById">;
  appConnectionService: Pick<TAppConnectionServiceFactory, "validateAppConnectionUsageById">;
  externalCertificateAuthorityDAL: Pick<TExternalCertificateAuthorityDALFactory, "create" | "update" | "findOne">;
  keyStore: Pick<TKeyStoreFactory, "acquireLock" | "setItemWithExpiry" | "getItem">;
  certificateAuthorityCrlDAL: TCertificateAuthorityCrlDALFactory;
  certificateAuthoritySecretDAL: TCertificateAuthoritySecretDALFactory;
  certificateDAL: TCertificateDALFactory;
  projectDAL: Pick<TProjectDALFactory, "findProjectBySlug" | "findOne" | "updateById" | "findById" | "transaction">;
  kmsDataKeyService: TKmsDataKeyService;
  kmsKeyService: TKmsKeyService;
  certificateBodyDAL: Pick<TCertificateBodyDALFactory, "create">;
  certificateSecretDAL: Pick<TCertificateSecretDALFactory, "create">;
  queueService: TQueueServiceFactory;
  cronJob: TCronJobFactory;
  pkiSubscriberDAL: Pick<TPkiSubscriberDALFactory, "findById" | "updateById">;
  pkiSyncDAL: Pick<TPkiSyncDALFactory, "find">;
  pkiSyncQueue: Pick<TPkiSyncQueueFactory, "queuePkiSyncSyncCertificatesById">;
  caKeySourceService: Pick<TCaKeySourceServiceFactory, "buildSigner">;
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
  gatewayPoolService: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">;
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
};

export type TCertificateAuthorityQueueFactory = ReturnType<typeof certificateAuthorityQueueFactory>;

const CA_CRL_REBUILD_BATCH_SIZE = 100;

export const certificateAuthorityQueueFactory = ({
  certificateAuthorityCrlDAL,
  certificateAuthorityDAL,
  certificateAuthorityCertDAL,
  certificateAuthoritySecretDAL,
  certificateDAL,
  projectDAL,
  kmsDataKeyService,
  kmsKeyService,
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
  caKeySourceService,
  gatewayV2Service,
  gatewayPoolService,
  auditLogService
}: TCertificateAuthorityQueueFactoryDep) => {
  const acmeFns = AcmeCertificateAuthorityFns({
    appConnectionDAL,
    appConnectionService,
    certificateAuthorityDAL,
    externalCertificateAuthorityDAL,
    certificateDAL,
    certificateBodyDAL,
    certificateSecretDAL,
    kmsDataKeyService,
    kmsKeyService,
    pkiSubscriberDAL,
    projectDAL,
    pkiSyncDAL,
    pkiSyncQueue,
    gatewayV2Service,
    gatewayPoolService,
    keyStore
  });

  const azureAdCsFns = AzureAdCsCertificateAuthorityFns({
    appConnectionDAL,
    appConnectionService,
    certificateAuthorityDAL,
    externalCertificateAuthorityDAL,
    certificateDAL,
    certificateBodyDAL,
    certificateSecretDAL,
    kmsDataKeyService,
    kmsKeyService,
    pkiSubscriberDAL,
    projectDAL,
    pkiSyncDAL,
    pkiSyncQueue
  });

  const startCaCrlRebuildJob = () => {
    const appCfg = getConfig();
    const cronPattern = appCfg.NODE_ENV === "development" ? "*/5 * * * *" : "0 * * * *";

    cronJob.register({
      name: CronJobName.CaCrlRotation,
      pattern: cronPattern,
      runHashTtlS: 3 * 24 * 60 * 60,
      enabled: !appCfg.isSecondaryInstance,
      handler: async () => {
        logger.info(`${QueueJobs.CaCrlRotation}: starting rebuild of CRLs due for renewal`);

        let afterId: string | undefined;
        let totalRebuilt = 0;

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const dueCrls = await certificateAuthorityCrlDAL.findDueForRebuild({
            afterId,
            limit: CA_CRL_REBUILD_BATCH_SIZE
          });
          if (dueCrls.length === 0) break;

          for (const dueCrl of dueCrls) {
            try {
              await rebuildCaCrl({
                caId: dueCrl.caId,
                trigger: CaCrlRegenerationTrigger.Scheduled,
                auditLogService,
                certificateAuthorityDAL,
                certificateAuthorityCrlDAL,
                certificateAuthorityCertDAL,
                certificateAuthoritySecretDAL,
                projectDAL,
                certificateDAL,
                kmsDataKeyService,
                kmsKeyService,
                caKeySourceService,
                keyStore
              });
              totalRebuilt += 1;
            } catch (err) {
              logger.error(err, `${QueueJobs.CaCrlRotation}: failed to rebuild CRL [caId=${dueCrl.caId}]`);
            }
          }

          if (dueCrls.length < CA_CRL_REBUILD_BATCH_SIZE) break;
          afterId = dueCrls[dueCrls.length - 1].id;
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
