import { ForbiddenError } from "@casl/ability";
import * as x509 from "@peculiar/x509";

import { TCertificateAuthorityCrlDALFactory } from "@app/ee/services/certificate-authority-crl/certificate-authority-crl-dal";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { TCertificateBodyDALFactory } from "@app/services/certificate/certificate-body-dal";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import { TCertificateAuthorityCertDALFactory } from "@app/services/certificate-authority/certificate-authority-cert-dal";
import { TCertificateAuthorityDALFactory } from "@app/services/certificate-authority/certificate-authority-dal";
import { TCertificateAuthoritySecretDALFactory } from "@app/services/certificate-authority/certificate-authority-secret-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { getProjectKmsCertificateKeyId } from "@app/services/project/project-fns";

import { getCaCertChain, rebuildCaCrl } from "../certificate-authority/certificate-authority-fns";
import { revocationReasonToCrlCode } from "./certificate-fns";
import { CertStatus, TDeleteCertDTO, TGetCertBodyDTO, TGetCertDTO, TRevokeCertDTO } from "./certificate-types";

type TCertificateServiceFactoryDep = {
  certificateDAL: Pick<TCertificateDALFactory, "findOne" | "deleteById" | "update" | "find">;
  certificateBodyDAL: Pick<TCertificateBodyDALFactory, "findOne">;
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "findById">;
  certificateAuthorityCertDAL: Pick<TCertificateAuthorityCertDALFactory, "findOne">;
  certificateAuthorityCrlDAL: Pick<TCertificateAuthorityCrlDALFactory, "update">;
  certificateAuthoritySecretDAL: Pick<TCertificateAuthoritySecretDALFactory, "findOne">;
  projectDAL: Pick<TProjectDALFactory, "findOne" | "updateById" | "findById" | "transaction">;
  kmsService: Pick<TKmsServiceFactory, "generateKmsKey" | "encryptWithKmsKey" | "decryptWithKmsKey">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
};

export type TCertificateServiceFactory = ReturnType<typeof certificateServiceFactory>;

export const certificateServiceFactory = ({
  certificateDAL,
  certificateBodyDAL,
  certificateAuthorityDAL,
  certificateAuthorityCertDAL,
  certificateAuthorityCrlDAL,
  certificateAuthoritySecretDAL,
  projectDAL,
  kmsService,
  permissionService
}: TCertificateServiceFactoryDep) => {
  /**
   * Return details for certificate with serial number [serialNumber]
   */
  const getCert = async ({ serialNumber, actorId, actorAuthMethod, actor, actorOrgId }: TGetCertDTO) => {
    const cert = await certificateDAL.findOne({ serialNumber });
    const ca = await certificateAuthorityDAL.findById(cert.caId);

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      ca.projectId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Certificates);

    return {
      cert,
      ca
    };
  };

  /**
   * Delete certificate with serial number [serialNumber]
   */
  const deleteCert = async ({ serialNumber, actorId, actorAuthMethod, actor, actorOrgId }: TDeleteCertDTO) => {
    const cert = await certificateDAL.findOne({ serialNumber });
    const ca = await certificateAuthorityDAL.findById(cert.caId);

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      ca.projectId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Delete, ProjectPermissionSub.Certificates);

    const deletedCert = await certificateDAL.deleteById(cert.id);

    return {
      deletedCert,
      ca
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
    const ca = await certificateAuthorityDAL.findById(cert.caId);

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      ca.projectId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Delete, ProjectPermissionSub.Certificates);

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

    return { revokedAt, cert, ca };
  };

  /**
   * Return certificate body and certificate chain for certificate with
   * serial number [serialNumber]
   */
  const getCertBody = async ({ serialNumber, actorId, actorAuthMethod, actor, actorOrgId }: TGetCertBodyDTO) => {
    const cert = await certificateDAL.findOne({ serialNumber });
    const ca = await certificateAuthorityDAL.findById(cert.caId);

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      ca.projectId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Certificates);

    const certBody = await certificateBodyDAL.findOne({ certId: cert.id });

    const certificateManagerKeyId = await getProjectKmsCertificateKeyId({
      projectId: ca.projectId,
      projectDAL,
      kmsService
    });

    const kmsDecryptor = await kmsService.decryptWithKmsKey({
      kmsId: certificateManagerKeyId
    });
    const decryptedCert = kmsDecryptor({
      cipherTextBlob: certBody.encryptedCertificate
    });

    const certObj = new x509.X509Certificate(decryptedCert);

    const { caCert, caCertChain } = await getCaCertChain({
      caId: ca.id,
      certificateAuthorityDAL,
      certificateAuthorityCertDAL,
      projectDAL,
      kmsService
    });

    return {
      certificate: certObj.toString("pem"),
      certificateChain: `${caCert}\n${caCertChain}`.trim(),
      serialNumber: certObj.serialNumber,
      cert,
      ca
    };
  };

  return {
    getCert,
    deleteCert,
    revokeCert,
    getCertBody
  };
};
