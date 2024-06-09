// import * as x509 from "@peculiar/x509";
// import crypto from "crypto";

import { getConfig } from "@app/lib/config/env";
import { daysToMillisecond, secondsToMillis } from "@app/lib/dates";
// import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";

// import { CertKeyAlgorithm, CertStatus } from "@app/services/certificate/certificate-types";
import { TCertificateAuthorityCrlDALFactory } from "./certificate-authority-crl-dal";
import { TCertificateAuthorityDALFactory } from "./certificate-authority-dal";
// import { keyAlgorithmToAlgCfg } from "./certificate-authority-fns";
import { TCertificateAuthoritySecretDALFactory } from "./certificate-authority-secret-dal";
import { TRotateCaCrlTriggerDTO } from "./certificate-authority-types";

type TCertificateAuthorityQueueFactoryDep = {
  // TODO: Pick
  certificateAuthorityDAL: TCertificateAuthorityDALFactory;
  certificateAuthorityCrlDAL: TCertificateAuthorityCrlDALFactory;
  certificateAuthoritySecretDAL: TCertificateAuthoritySecretDALFactory;
  certificateDAL: TCertificateDALFactory;
  queueService: TQueueServiceFactory;
};
export type TCertificateAuthorityQueueFactory = ReturnType<typeof certificateAuthorityQueueFactory>;

export const certificateAuthorityQueueFactory = ({
  // certificateAuthorityCrlDAL,
  // certificateAuthorityDAL,
  // certificateAuthoritySecretDAL,
  // certificateDAL,
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

  // queueService.start(QueueName.CaCrlRotation, async (job) => {
  //   const { caId } = job.data;
  //   logger.info(`secretReminderQueue.process: [secretDocument=${caId}]`);

  //   const ca = await certificateAuthorityDAL.findById(caId);
  //   if (!ca) throw new BadRequestError({ message: "CA not found" });

  //   const caKeys = await certificateAuthoritySecretDAL.findOne({ caId: ca.id });

  //   const alg = keyAlgorithmToAlgCfg(ca.keyAlgorithm as CertKeyAlgorithm);
  //   const skObj = crypto.createPrivateKey({ key: caKeys.sk, format: "pem", type: "pkcs8" });
  //   const sk = await crypto.subtle.importKey("pkcs8", skObj.export({ format: "der", type: "pkcs8" }), alg, true, [
  //     "sign"
  //   ]);

  //   const revokedCerts = await certificateDAL.find({
  //     caId: ca.id,
  //     status: CertStatus.REVOKED
  //   });

  //   const crl = await x509.X509CrlGenerator.create({
  //     issuer: ca.dn,
  //     thisUpdate: new Date(),
  //     nextUpdate: new Date("2025/12/12"), // TODO: depends on configured rebuild interval
  //     entries: revokedCerts.map((revokedCert) => {
  //       return {
  //         serialNumber: revokedCert.serialNumber,
  //         revocationDate: new Date(revokedCert.revokedAt as Date),
  //         reason: revokedCert.revocationReason as number,
  //         invalidity: new Date("2022/01/01"),
  //         issuer: ca.dn
  //       };
  //     }),
  //     signingAlgorithm: alg,
  //     signingKey: sk
  //   });

  //   const base64crl = crl.toString("base64");
  //   const crlPem = `-----BEGIN X509 CRL-----\n${base64crl.match(/.{1,64}/g)?.join("\n")}\n-----END X509 CRL-----`;

  //   await certificateAuthorityCrlDAL.update(
  //     {
  //       caId: ca.id
  //     },
  //     {
  //       crl: crlPem // TODO: encrypt
  //     }
  //   );
  // });

  queueService.listen(QueueName.CaCrlRotation, "failed", (job, err) => {
    logger.error(err, "Failed to rotate CA CRL %s", job?.id);
  });

  return {
    setCaCrlRotationInterval
  };
};
