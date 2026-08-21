/* eslint-disable no-await-in-loop */
import * as x509 from "@peculiar/x509";
import RE2 from "re2";

import { TCertificates } from "@app/db/schemas";
import { logger } from "@app/lib/logger";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { getProjectKmsCertificateKeyId } from "@app/services/project/project-fns";

import { TCertificateBodyDALFactory } from "../certificate/certificate-body-dal";
import { TCertificateDALFactory } from "../certificate/certificate-dal";
import { getCertificateCredentials } from "../certificate/certificate-fns";
import { TCertificateSecretDALFactory } from "../certificate/certificate-secret-dal";
import { TCertificateAuthorityCertDALFactory } from "../certificate-authority/certificate-authority-cert-dal";
import { TCertificateAuthorityDALFactory } from "../certificate-authority/certificate-authority-dal";
import { getCaCertChain } from "../certificate-authority/certificate-authority-fns";
import { extractRootCaFromChain, removeRootCaFromChain } from "../certificate-common/certificate-utils";
import { TCertificateSyncDALFactory } from "../certificate-sync/certificate-sync-dal";
import { compileCertificateNameSchema } from "./pki-sync-certificate-name-fns";
import { PkiSync } from "./pki-sync-enums";
import { PkiSyncError } from "./pki-sync-errors";
import { TCertificateMap, TPkiSyncRaw, TPkiSyncWithCredentials } from "./pki-sync-types";

const DASH_REGEX = new RE2("-", "g");
const NON_ALPHANUMERIC_REGEX = new RE2("[^a-zA-Z0-9]", "g");

type TBuildCertificateMapDeps = {
  certificateDAL: TCertificateDALFactory;
  certificateBodyDAL: Pick<TCertificateBodyDALFactory, "findOne">;
  certificateSecretDAL: Pick<TCertificateSecretDALFactory, "findOne">;
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "findById">;
  certificateAuthorityCertDAL: Pick<TCertificateAuthorityCertDALFactory, "findById">;
  certificateSyncDAL: Pick<TCertificateSyncDALFactory, "findCertificateIdsByPkiSyncId">;
  projectDAL: TProjectDALFactory;
  kmsService: Pick<
    TKmsServiceFactory,
    "decryptWithKmsKey" | "generateKmsKey" | "encryptWithKmsKey" | "createCipherPairWithDataKey"
  >;
};

export const buildCertificateMap = async (
  pkiSync: TPkiSyncRaw | TPkiSyncWithCredentials,
  {
    certificateDAL,
    certificateBodyDAL,
    certificateSecretDAL,
    certificateAuthorityDAL,
    certificateAuthorityCertDAL,
    certificateSyncDAL,
    projectDAL,
    kmsService
  }: TBuildCertificateMapDeps
): Promise<{ certificateMap: TCertificateMap; certificateMetadata: Map<string, { id: string; name: string }> }> => {
  const { projectId, subscriberId, id: pkiSyncId } = pkiSync;

  const certificateMap: TCertificateMap = {};
  const certificateMetadata = new Map<string, { id: string; name: string }>();
  let certificates: Array<{ id: string; projectId: string; caCertId?: string | null }> = [];

  try {
    if (subscriberId) {
      const subscriberCertificates = await certificateDAL.findAllActiveCertsForSubscriber({
        subscriberId
      });
      certificates.push(...subscriberCertificates);
    }

    const certificateIds = await certificateSyncDAL.findCertificateIdsByPkiSyncId(pkiSyncId);
    if (certificateIds.length > 0) {
      const directCertificates = await certificateDAL.findActiveCertificatesByIds(certificateIds);
      certificates.push(...directCertificates);
    }

    const uniqueCertificates = certificates.filter(
      (cert, index, self) => self.findIndex((c) => c.id === cert.id) === index
    );

    const activeCertificates = uniqueCertificates.filter((cert) => {
      const typedCert = cert as TCertificates;
      return !typedCert.renewedByCertificateId;
    });

    if (activeCertificates.length === 0) {
      return { certificateMap, certificateMetadata };
    }

    certificates = activeCertificates;

    for (const certificate of certificates) {
      const cert = certificate as TCertificates;
      try {
        const certBody = await certificateBodyDAL.findOne({ certId: certificate.id });

        if (certBody) {
          const certificateManagerKeyId = await getProjectKmsCertificateKeyId({
            projectId: certificate.projectId,
            projectDAL,
            kmsService
          });

          const kmsDecryptor = await kmsService.decryptWithKmsKey({
            kmsId: certificateManagerKeyId
          });

          const decryptedCert = await kmsDecryptor({
            cipherTextBlob: certBody.encryptedCertificate
          });

          const certObj = new x509.X509Certificate(decryptedCert);
          const certificatePem = certObj.toString("pem");

          let certPrivateKey: string | undefined;
          try {
            const credentials = await getCertificateCredentials({
              certId: certificate.id,
              projectId: certificate.projectId,
              certificateSecretDAL,
              projectDAL,
              kmsService
            });
            certPrivateKey = credentials.certPrivateKey;
          } catch (credError) {
            logger.warn(
              { certificateId: certificate.id, subscriberId, error: credError },
              "Certificate private key not found - certificate may be imported or key was not stored"
            );
            certPrivateKey = undefined;
          }

          let certificateChain: string | undefined;
          let caCertificate: string | undefined;
          try {
            if (certBody.encryptedCertificateChain) {
              const decryptedCertChain = await kmsDecryptor({
                cipherTextBlob: certBody.encryptedCertificateChain
              });
              certificateChain = decryptedCertChain.toString();
            }
            if (certificate.caCertId) {
              const { caCert, caCertChain } = await getCaCertChain({
                caCertId: certificate.caCertId,
                certificateAuthorityDAL,
                certificateAuthorityCertDAL,
                projectDAL,
                kmsService
              });
              if (!certBody.encryptedCertificateChain) {
                certificateChain = `${caCert}\n${caCertChain}`.trim();
              }
              caCertificate = certificateChain ? extractRootCaFromChain(certificateChain) : caCert;
            }
          } catch (chainError) {
            logger.warn(
              { certificateId: certificate.id, subscriberId, error: chainError },
              "Certificate chain not found or could not be decrypted - certificate may be imported or chain was not stored"
            );
            certificateChain = undefined;
            caCertificate = undefined;
          }

          let certificateName: string;
          const syncOptions = pkiSync.syncOptions as
            | {
                certificateNameSchema?: string;
                includeRootCa?: boolean;
              }
            | undefined;
          const certificateNameSchema = syncOptions?.certificateNameSchema;

          if (certificateNameSchema) {
            certificateName = compileCertificateNameSchema(
              certificateNameSchema,
              {
                certificateId: certificate.id,
                profileId: cert.profileId,
                applicationId: pkiSync.applicationId,
                applicationName: pkiSync.applicationName,
                commonName: cert.commonName
              },
              pkiSync.destination as PkiSync
            );
          } else {
            const stableId = cert.profileId
              ? `${cert.profileId.replace(DASH_REGEX, "")}-${(cert.commonName || "").replace(NON_ALPHANUMERIC_REGEX, "")}`
              : certificate.id.replace(DASH_REGEX, "");
            certificateName = `Infisical-${stableId}`;
          }

          const alternativeNames: string[] = [];

          const legacyName = `Infisical-${certificate.id.replace(DASH_REGEX, "")}`;
          if (legacyName !== certificateName) {
            alternativeNames.push(legacyName);
          }

          if (cert.renewedFromCertificateId) {
            const originalLegacyName = `Infisical-${cert.renewedFromCertificateId.replace(DASH_REGEX, "")}`;
            alternativeNames.push(originalLegacyName);
          }

          let processedCertificateChain = certificateChain;
          if (certificateChain && syncOptions?.includeRootCa === false) {
            processedCertificateChain = removeRootCaFromChain(certificateChain);
          }

          certificateMap[certificateName] = {
            cert: certificatePem,
            privateKey: certPrivateKey || "",
            certificateChain: processedCertificateChain,
            caCertificate,
            alternativeNames,
            certificateId: certificate.id,
            profileId: cert.profileId,
            commonName: cert.commonName
          };

          certificateMetadata.set(certificateName, {
            id: certificate.id,
            name: certificateName
          });
        } else {
          logger.warn({ certificateId: certificate.id, subscriberId }, "Certificate body not found for certificate");
        }
      } catch (error) {
        logger.error(
          { error, subscriberId, certificateId: certificate.id },
          "Failed to decrypt certificate for PKI sync"
        );
      }
    }
  } catch (error) {
    logger.error(
      error,
      `Failed to fetch certificate for subscriber [subscriberId=${subscriberId}] [projectId=${projectId}]`
    );
    throw new PkiSyncError({
      message: `Failed to fetch certificate for PKI subscriber: ${error instanceof Error ? error.message : String(error)}`,
      shouldRetry: true
    });
  }

  return { certificateMap, certificateMetadata };
};
