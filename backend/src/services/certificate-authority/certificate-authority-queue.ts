import * as x509 from "@peculiar/x509";
import crypto from "crypto";

import { getConfig } from "@app/lib/config/env";
import { daysToMillisecond, secondsToMillis } from "@app/lib/dates";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import { CertKeyAlgorithm, CertStatus } from "@app/services/certificate/certificate-types";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { getProjectKmsCertificateKeyId } from "@app/services/project/project-fns";

import { TCertificateAuthorityCrlDALFactory } from "../../ee/services/certificate-authority-crl/certificate-authority-crl-dal";
import { TCertificateAuthorityDALFactory } from "./certificate-authority-dal";
import { keyAlgorithmToAlgCfg } from "./certificate-authority-fns";
import { TCertificateAuthoritySecretDALFactory } from "./certificate-authority-secret-dal";
import { TRotateCaCrlTriggerDTO } from "./certificate-authority-types";

type TCertificateAuthorityQueueFactoryDep = {
  // TODO: Pick
  certificateAuthorityDAL: TCertificateAuthorityDALFactory;
  certificateAuthorityCrlDAL: TCertificateAuthorityCrlDALFactory;
  certificateAuthoritySecretDAL: TCertificateAuthoritySecretDALFactory;
  certificateDAL: TCertificateDALFactory;
  projectDAL: Pick<TProjectDALFactory, "findProjectBySlug" | "findOne" | "updateById" | "findById" | "transaction">;
  kmsService: Pick<TKmsServiceFactory, "generateKmsKey" | "encryptWithKmsKey" | "decryptWithKmsKey">;
  queueService: TQueueServiceFactory;
};
export type TCertificateAuthorityQueueFactory = ReturnType<typeof certificateAuthorityQueueFactory>;

export const certificateAuthorityQueueFactory = ({
  certificateAuthorityCrlDAL,
  certificateAuthorityDAL,
  certificateAuthoritySecretDAL,
  certificateDAL,
  projectDAL,
  kmsService,
  queueService
}: TCertificateAuthorityQueueFactoryDep) => {
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

  queueService.start(QueueName.CaCrlRotation, async (job) => {
    const { caId } = job.data;
    logger.info(`secretReminderQueue.process: [secretDocument=${caId}]`);

    const ca = await certificateAuthorityDAL.findById(caId);
    if (!ca) throw new BadRequestError({ message: "CA not found" });

    const caSecret = await certificateAuthoritySecretDAL.findOne({ caId: ca.id });

    const alg = keyAlgorithmToAlgCfg(ca.keyAlgorithm as CertKeyAlgorithm);

    const keyId = await getProjectKmsCertificateKeyId({
      projectId: ca.projectId,
      projectDAL,
      kmsService
    });

    const kmsDecryptor = await kmsService.decryptWithKmsKey({
      kmsId: keyId
    });
    const privateKey = kmsDecryptor({
      cipherTextBlob: caSecret.encryptedPrivateKey
    });

    const skObj = crypto.createPrivateKey({ key: privateKey, format: "der", type: "pkcs8" });
    const sk = await crypto.subtle.importKey("pkcs8", skObj.export({ format: "der", type: "pkcs8" }), alg, true, [
      "sign"
    ]);

    const revokedCerts = await certificateDAL.find({
      caId: ca.id,
      status: CertStatus.REVOKED
    });

    const crl = await x509.X509CrlGenerator.create({
      issuer: ca.dn,
      thisUpdate: new Date(),
      nextUpdate: new Date("2025/12/12"), // TODO: depends on configured rebuild interval
      entries: revokedCerts.map((revokedCert) => {
        return {
          serialNumber: revokedCert.serialNumber,
          revocationDate: new Date(revokedCert.revokedAt as Date),
          reason: revokedCert.revocationReason as number,
          invalidity: new Date("2022/01/01"),
          issuer: ca.dn
        };
      }),
      signingAlgorithm: alg,
      signingKey: sk
    });

    const kmsEncryptor = await kmsService.encryptWithKmsKey({
      kmsId: keyId
    });
    const { cipherTextBlob: encryptedCrl } = kmsEncryptor({
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
    setCaCrlRotationInterval
  };
};
