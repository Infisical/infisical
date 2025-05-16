import { ForbiddenError } from "@casl/ability";
import * as x509 from "@peculiar/x509";
import { createPrivateKey, createPublicKey, sign, verify } from "crypto";

import { ActionProjectType, ProjectType } from "@app/db/schemas";
import { TCertificateAuthorityCrlDALFactory } from "@app/ee/services/certificate-authority-crl/certificate-authority-crl-dal";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import {
  ProjectPermissionCertificateActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { TCertificateBodyDALFactory } from "@app/services/certificate/certificate-body-dal";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import { TCertificateAuthorityCertDALFactory } from "@app/services/certificate-authority/certificate-authority-cert-dal";
import { TCertificateAuthorityDALFactory } from "@app/services/certificate-authority/certificate-authority-dal";
import { TCertificateAuthoritySecretDALFactory } from "@app/services/certificate-authority/certificate-authority-secret-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TPkiCollectionDALFactory } from "@app/services/pki-collection/pki-collection-dal";
import { TPkiCollectionItemDALFactory } from "@app/services/pki-collection/pki-collection-item-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { getProjectKmsCertificateKeyId } from "@app/services/project/project-fns";

import { expandInternalCa, getCaCertChain, rebuildCaCrl } from "../certificate-authority/certificate-authority-fns";
import { buildCertificateChain, getCertificateCredentials, revocationReasonToCrlCode } from "./certificate-fns";
import { TCertificateSecretDALFactory } from "./certificate-secret-dal";
import {
  CertExtendedKeyUsage,
  CertExtendedKeyUsageOIDToName,
  CertKeyUsage,
  CertStatus,
  TDeleteCertDTO,
  TGetCertBodyDTO,
  TGetCertBundleDTO,
  TGetCertDTO,
  TGetCertPrivateKeyDTO,
  TImportCertDTO,
  TRevokeCertDTO
} from "./certificate-types";

type TCertificateServiceFactoryDep = {
  certificateDAL: Pick<TCertificateDALFactory, "findOne" | "deleteById" | "update" | "find">;
  certificateSecretDAL: Pick<TCertificateSecretDALFactory, "findOne">;
  certificateBodyDAL: Pick<TCertificateBodyDALFactory, "findOne">;
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "findById" | "findByIdWithAssociatedCa">;
  certificateAuthorityCertDAL: Pick<TCertificateAuthorityCertDALFactory, "findById">;
  certificateAuthorityCrlDAL: Pick<TCertificateAuthorityCrlDALFactory, "update">;
  certificateAuthoritySecretDAL: Pick<TCertificateAuthoritySecretDALFactory, "findOne">;
  pkiCollectionDAL: Pick<TPkiCollectionDALFactory, "findById">;
  pkiCollectionItemDAL: Pick<TPkiCollectionItemDALFactory, "create">;
  projectDAL: Pick<
    TProjectDALFactory,
    "findProjectBySlug" | "findOne" | "updateById" | "findById" | "transaction" | "getProjectFromSplitId"
  >;
  kmsService: Pick<TKmsServiceFactory, "generateKmsKey" | "encryptWithKmsKey" | "decryptWithKmsKey">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
};

export type TCertificateServiceFactory = ReturnType<typeof certificateServiceFactory>;

export const certificateServiceFactory = ({
  certificateDAL,
  certificateSecretDAL,
  certificateBodyDAL,
  certificateAuthorityDAL,
  certificateAuthorityCertDAL,
  certificateAuthorityCrlDAL,
  certificateAuthoritySecretDAL,
  pkiCollectionDAL,
  pkiCollectionItemDAL,
  projectDAL,
  kmsService,
  permissionService
}: TCertificateServiceFactoryDep) => {
  /**
   * Return details for certificate with serial number [serialNumber]
   */
  const getCert = async ({ serialNumber, actorId, actorAuthMethod, actor, actorOrgId }: TGetCertDTO) => {
    const cert = await certificateDAL.findOne({ serialNumber });
    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(cert.caId);

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: cert.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCertificateActions.Read,
      ProjectPermissionSub.Certificates
    );

    return {
      cert,
      ca: expandInternalCa(ca)
    };
  };

  /**
   * Get certificate private key.
   */
  const getCertPrivateKey = async ({
    serialNumber,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TGetCertPrivateKeyDTO) => {
    const cert = await certificateDAL.findOne({ serialNumber });
    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(cert.caId);

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: cert.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCertificateActions.ReadPrivateKey,
      ProjectPermissionSub.Certificates
    );

    const { certPrivateKey } = await getCertificateCredentials({
      certId: cert.id,
      projectId: cert.projectId,
      certificateSecretDAL,
      projectDAL,
      kmsService
    });

    return {
      ca: expandInternalCa(ca),
      cert,
      certPrivateKey
    };
  };

  /**
   * Delete certificate with serial number [serialNumber]
   */
  const deleteCert = async ({ serialNumber, actorId, actorAuthMethod, actor, actorOrgId }: TDeleteCertDTO) => {
    const cert = await certificateDAL.findOne({ serialNumber });
    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(cert.caId);

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: cert.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCertificateActions.Delete,
      ProjectPermissionSub.Certificates
    );

    const deletedCert = await certificateDAL.deleteById(cert.id);

    return {
      deletedCert,
      ca: expandInternalCa(ca)
    };
  };

  /**
   * Revoke certificate with serial number [serialNumber].
   * Note: Revoking a certificate adds it to the certificate revocation list (CRL)
   * of its issuing CA
   */
  const revokeCert = async ({
    serialNumber,
    revocationReason,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TRevokeCertDTO) => {
    const cert = await certificateDAL.findOne({ serialNumber });
    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(cert.caId);

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: ca.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCertificateActions.Delete,
      ProjectPermissionSub.Certificates
    );

    if (cert.status === CertStatus.REVOKED) throw new Error("Certificate already revoked");

    const revokedAt = new Date();
    await certificateDAL.update(
      {
        id: cert.id
      },
      {
        status: CertStatus.REVOKED,
        revokedAt,
        revocationReason: revocationReasonToCrlCode(revocationReason)
      }
    );

    // rebuild CRL (TODO: move to interval-based cron job)
    await rebuildCaCrl({
      caId: ca.id,
      certificateAuthorityDAL,
      certificateAuthorityCrlDAL,
      certificateAuthoritySecretDAL,
      projectDAL,
      certificateDAL,
      kmsService
    });

    return { revokedAt, cert, ca: expandInternalCa(ca) };
  };

  /**
   * Return certificate body and certificate chain for certificate with
   * serial number [serialNumber]
   */
  const getCertBody = async ({ serialNumber, actorId, actorAuthMethod, actor, actorOrgId }: TGetCertBodyDTO) => {
    const cert = await certificateDAL.findOne({ serialNumber });
    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(cert.caId);

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: cert.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCertificateActions.Read,
      ProjectPermissionSub.Certificates
    );

    const certBody = await certificateBodyDAL.findOne({ certId: cert.id });

    const certificateManagerKeyId = await getProjectKmsCertificateKeyId({
      projectId: cert.projectId,
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

    let certificateChain = null;

    // On newer certs the certBody.encryptedCertificateChain column will always exist.
    // Older certs will have a caCertId which will be used as a fallback mechanism for structuring the chain.
    if (certBody.encryptedCertificateChain) {
      const decryptedCertChain = await kmsDecryptor({
        cipherTextBlob: certBody.encryptedCertificateChain
      });
      certificateChain = decryptedCertChain.toString();
    } else if (cert.caCertId) {
      const { caCert, caCertChain } = await getCaCertChain({
        caCertId: cert.caCertId,
        certificateAuthorityDAL,
        certificateAuthorityCertDAL,
        projectDAL,
        kmsService
      });

      certificateChain = `${caCert}\n${caCertChain}`.trim();
    }

    return {
      certificate: certObj.toString("pem"),
      certificateChain,
      serialNumber: certObj.serialNumber,
      cert,
      ca: expandInternalCa(ca)
    };
  };

  /**
   * Return certificate body and certificate chain for certificate with
   * serial number [serialNumber]
   */
  const getCertBundle = async ({ serialNumber, actorId, actorAuthMethod, actor, actorOrgId }: TGetCertBundleDTO) => {
    const cert = await certificateDAL.findOne({ serialNumber });
    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(cert.caId);

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: cert.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCertificateActions.Read,
      ProjectPermissionSub.Certificates
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCertificateActions.ReadPrivateKey,
      ProjectPermissionSub.Certificates
    );

    const certBody = await certificateBodyDAL.findOne({ certId: cert.id });

    const certificateManagerKeyId = await getProjectKmsCertificateKeyId({
      projectId: cert.projectId,
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
    const certificate = certObj.toString("pem");

    let certificateChain = null;

    // On newer certs the certBody.encryptedCertificateChain column will always exist.
    // Older certs will have a caCertId which will be used as a fallback mechanism for structuring the chain.
    if (certBody.encryptedCertificateChain) {
      const decryptedCertChain = await kmsDecryptor({
        cipherTextBlob: certBody.encryptedCertificateChain
      });
      certificateChain = decryptedCertChain.toString();
    } else if (cert.caCertId) {
      const { caCert, caCertChain } = await getCaCertChain({
        caCertId: cert.caCertId,
        certificateAuthorityDAL,
        certificateAuthorityCertDAL,
        projectDAL,
        kmsService
      });

      certificateChain = `${caCert}\n${caCertChain}`.trim();
    }

    const { certPrivateKey } = await getCertificateCredentials({
      certId: cert.id,
      projectId: cert.projectId,
      certificateSecretDAL,
      projectDAL,
      kmsService
    });

    return {
      certificate,
      certificateChain,
      privateKey: certPrivateKey,
      serialNumber,
      cert,
      ca: expandInternalCa(ca)
    };
  };

  return {
    getCert,
    getCertPrivateKey,
    deleteCert,
    revokeCert,
    getCertBody,
    importCert,
    getCertBundle
  };
};
