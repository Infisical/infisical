import { ForbiddenError } from "@casl/ability";
import * as x509 from "@peculiar/x509";

import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { TCertificateCertDALFactory } from "@app/services/certificate/certificate-cert-dal";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import { TCertificateSecretDALFactory } from "@app/services/certificate/certificate-secret-dal";
import { TCertificateAuthorityCertDALFactory } from "@app/services/certificate-authority/certificate-authority-cert-dal";
import { TCertificateAuthorityDALFactory } from "@app/services/certificate-authority/certificate-authority-dal";

import { TDeleteCertDTO, TGetCertCertDTO, TGetCertDTO } from "./certificate-types";

type TCertificateServiceFactoryDep = {
  // TODO: Pick
  certificateDAL: TCertificateDALFactory;
  certificateCertDAL: TCertificateCertDALFactory;
  certificateSecretDAL: TCertificateSecretDALFactory;
  certificateAuthorityDAL: TCertificateAuthorityDALFactory;
  certificateAuthorityCertDAL: TCertificateAuthorityCertDALFactory;
  permissionService: TPermissionServiceFactory;
};

export type TCertificateServiceFactory = ReturnType<typeof certificateServiceFactory>;

export const certificateServiceFactory = ({
  certificateDAL,
  certificateCertDAL,
  certificateSecretDAL,
  certificateAuthorityDAL,
  certificateAuthorityCertDAL,
  permissionService
}: TCertificateServiceFactoryDep) => {
  const getCertById = async ({ certId, actorId, actorAuthMethod, actor, actorOrgId }: TGetCertDTO) => {
    const cert = await certificateDAL.findById(certId);
    const ca = await certificateAuthorityDAL.findById(cert.caId);

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      ca.projectId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Certificates);

    return cert;
  };

  const deleteCertById = async ({ certId, actorId, actorAuthMethod, actor, actorOrgId }: TDeleteCertDTO) => {
    const cert = await certificateDAL.findById(certId);
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
    return deletedCert;
  };

  const getCertCert = async ({ certId, actorId, actorAuthMethod, actor, actorOrgId }: TGetCertCertDTO) => {
    const cert = await certificateDAL.findById(certId);
    const ca = await certificateAuthorityDAL.findById(cert.caId);

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      ca.projectId,
      actorAuthMethod,
      actorOrgId
    );
    // TODO: re-evaluate this permission
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Create, ProjectPermissionSub.Certificates);

    const caCert = await certificateAuthorityCertDAL.findOne({ caId: ca.id });
    const certCert = await certificateCertDAL.findOne({ certId });
    const certSecret = await certificateSecretDAL.findOne({ certId });
    const certObj = new x509.X509Certificate(certCert.certificate);

    return {
      certificate: certCert.certificate,
      certificateChain: certCert.certificateChain,
      issuingCaCertificate: caCert.certificate,
      privateKey: certSecret.sk,
      serialNumber: certObj.serialNumber
    };
  };

  return {
    getCertById,
    deleteCertById,
    getCertCert
  };
};
