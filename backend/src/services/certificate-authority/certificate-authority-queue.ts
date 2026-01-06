import * as x509 from "@peculiar/x509";

import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto/cryptography";
import { daysToMillisecond, secondsToMillis } from "@app/lib/dates";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";
import { DEFAULT_CRL_VALIDITY_DAYS } from "@app/services/certificate-common/certificate-constants";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import { CertKeyAlgorithm, CertStatus } from "@app/services/certificate/certificate-types";
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
import { keyAlgorithmToAlgCfg } from "./certificate-authority-fns";
import { TCertificateAuthoritySecretDALFactory } from "./certificate-authority-secret-dal";
import { TExternalCertificateAuthorityDALFactory } from "./external-certificate-authority-dal";
import {
  TOrderCertificateForSubscriberDTO,
  TRotateCaCrlTriggerDTO
} from "./internal/internal-certificate-authority-types";

type TCertificateAuthorityQueueFactoryDep = {
  certificateAuthorityDAL: TCertificateAuthorityDALFactory;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById" | "update" | "updateById">;
  appConnectionService: Pick<TAppConnectionServiceFactory, "validateAppConnectionUsageById">;
  externalCertificateAuthorityDAL: Pick<TExternalCertificateAuthorityDALFactory, "create" | "update">;
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
  pkiSubscriberDAL: Pick<TPkiSubscriberDALFactory, "findById" | "updateById">;
  pkiSyncDAL: Pick<TPkiSyncDALFactory, "find">;
  pkiSyncQueue: Pick<TPkiSyncQueueFactory, "queuePkiSyncSyncCertificatesById">;
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
  keyStore,
  appConnectionDAL,
  appConnectionService,
  externalCertificateAuthorityDAL,
  certificateBodyDAL,
  certificateSecretDAL,
  pkiSubscriberDAL,
  pkiSyncDAL,
  pkiSyncQueue
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

  // TODO 1: auto-periodic rotation
  // TODO 2: manual rotation

  const setCaCrlRotationInterval = async ({ caId, rotationIntervalDays }: TRotateCaCrlTriggerDTO) => {
    const appCfg = getConfig();

    // query for config
    // const caCrl = await certificateAuthorityCrlDAL.findOne({
    //   caId
    // });

    await queueService.queue(
      // TODO: clarify queue + job naming
      QueueName.CaCrlRotation,
      QueueJobs.CaCrlRotation,
      {
        caId
      },
      {
        jobId: `ca-crl-rotation-${caId}`,
        repeat: {
          // on prod it this will be in days, in development this will be second
          every:
            appCfg.NODE_ENV === "development"
              ? secondsToMillis(rotationIntervalDays)
              : daysToMillisecond(rotationIntervalDays),
          immediately: true
        }
      }
    );
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
        removeOnFail: true
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

  queueService.start(QueueName.CaCrlRotation, async (job) => {
    const { caId } = job.data;
    logger.info(`secretReminderQueue.process: [secretDocument=${caId}]`);

    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(caId);
    if (!ca.internalCa) throw new NotFoundError({ message: `CA with ID '${caId}' not found` });

    const caSecret = await certificateAuthoritySecretDAL.findOne({ caId: ca.id });

    const alg = keyAlgorithmToAlgCfg(ca.internalCa.keyAlgorithm as CertKeyAlgorithm);

    const keyId = await getProjectKmsCertificateKeyId({
      projectId: ca.projectId,
      projectDAL,
      kmsService
    });

    const kmsDecryptor = await kmsService.decryptWithKmsKey({
      kmsId: keyId
    });
    const privateKey = await kmsDecryptor({
      cipherTextBlob: caSecret.encryptedPrivateKey
    });

    const skObj = crypto.nativeCrypto.createPrivateKey({ key: privateKey, format: "der", type: "pkcs8" });
    const sk = await crypto.nativeCrypto.subtle.importKey(
      "pkcs8",
      skObj.export({ format: "der", type: "pkcs8" }),
      alg,
      true,
      ["sign"]
    );

    const revokedCerts = await certificateDAL.find({
      caId: ca.id,
      status: CertStatus.REVOKED
    });

    const thisUpdate = new Date();
    const nextUpdate = new Date(thisUpdate);
    nextUpdate.setDate(nextUpdate.getDate() + DEFAULT_CRL_VALIDITY_DAYS);

    const crl = await x509.X509CrlGenerator.create({
      issuer: ca.internalCa.dn,
      thisUpdate,
      nextUpdate,
      entries: revokedCerts.map((revokedCert) => {
        return {
          serialNumber: revokedCert.serialNumber,
          revocationDate: new Date(revokedCert.revokedAt as Date),
          reason: revokedCert.revocationReason as number,
          invalidity: new Date("2022/01/01"),
          issuer: ca.internalCa?.dn
        };
      }),
      signingAlgorithm: alg,
      signingKey: sk
    });

    const kmsEncryptor = await kmsService.encryptWithKmsKey({
      kmsId: keyId
    });
    const { cipherTextBlob: encryptedCrl } = await kmsEncryptor({
      plainText: Buffer.from(new Uint8Array(crl.rawData))
    });

    await certificateAuthorityCrlDAL.update(
      {
        caId: ca.id
      },
      {
        encryptedCrl
      }
    );
  });

  queueService.listen(QueueName.CaCrlRotation, "failed", (job, err) => {
    logger.error(err, "Failed to rotate CA CRL %s", job?.id);
  });

  return {
    setCaCrlRotationInterval,
    orderCertificateForSubscriber
  };
};
