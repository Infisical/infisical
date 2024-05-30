import { ForbiddenError } from "@casl/ability";
import * as x509 from "@peculiar/x509";

import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { TCertificateCertDALFactory } from "@app/services/certificate/certificate-cert-dal";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import { TCertificateAuthorityDALFactory } from "@app/services/certificate-authority/certificate-authority-dal";

import { revocationReasonToCrlCode } from "./certificate-fns";
import { CertStatus, TDeleteCertDTO, TGetCertCertDTO, TGetCertDTO, TRevokeCertDTO } from "./certificate-types";

type TCertificateServiceFactoryDep = {
  certificateDAL: Pick<TCertificateDALFactory, "findOne" | "deleteById" | "update">;
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

    return cert;
  };

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
    return deletedCert;
  };

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

    return { revokedAt };
  };

  const getCertCert = async ({ serialNumber, actorId, actorAuthMethod, actor, actorOrgId }: TGetCertCertDTO) => {
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

    const certCert = await certificateCertDAL.findOne({ certId: cert.id });
    const certObj = new x509.X509Certificate(certCert.certificate);

    return {
      certificate: certCert.certificate,
      certificateChain: certCert.certificateChain,
      serialNumber: certObj.serialNumber
    };
  };

  return {
    getCert,
    deleteCert,
    revokeCert,
    getCertCert
  };
};
