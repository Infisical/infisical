import { ForbiddenError } from "@casl/ability";
import * as x509 from "@peculiar/x509";

import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { TCertificateCertDALFactory } from "@app/services/certificate/certificate-cert-dal";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import { TCertificateAuthorityDALFactory } from "@app/services/certificate-authority/certificate-authority-dal";

import { TDeleteCertDTO, TGetCertCertDTO, TGetCertDTO } from "./certificate-types";

type TCertificateServiceFactoryDep = {
  certificateDAL: Pick<TCertificateDALFactory, "findById" | "deleteById">;
  certificateCertDAL: Pick<TCertificateCertDALFactory, "findOne">;
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "findById">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
};

export type TCertificateServiceFactory = ReturnType<typeof certificateServiceFactory>;

export const certificateServiceFactory = ({
  certificateDAL,
  certificateCertDAL,
  certificateAuthorityDAL,
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

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Certificates);

    const certCert = await certificateCertDAL.findOne({ certId });
    const certObj = new x509.X509Certificate(certCert.certificate);

    return {
      certificate: certCert.certificate,
      certificateChain: certCert.certificateChain,
      serialNumber: certObj.serialNumber
    };
  };

  return {
    getCertById,
    deleteCertById,
    getCertCert
  };
};
