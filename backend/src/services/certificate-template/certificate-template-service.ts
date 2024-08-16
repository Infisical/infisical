import { ForbiddenError } from "@casl/ability";

import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { BadRequestError, NotFoundError } from "@app/lib/errors";

import { TCertificateAuthorityDALFactory } from "../certificate-authority/certificate-authority-dal";
import { TCertificateTemplateDALFactory } from "./certificate-template-dal";
import {
  TCreateCertTemplateDTO,
  TDeleteCertTemplateDTO,
  TGetCertTemplateDTO,
  TUpdateCertTemplateDTO
} from "./certificate-template-types";

type TCertificateTemplateServiceFactoryDep = {
  certificateTemplateDAL: TCertificateTemplateDALFactory;
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "findById">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
};

export type TCertificateTemplateServiceFactory = ReturnType<typeof certificateTemplateServiceFactory>;

export const certificateTemplateServiceFactory = ({
  certificateTemplateDAL,
  certificateAuthorityDAL,
  permissionService
}: TCertificateTemplateServiceFactoryDep) => {
  const createCertTemplate = async ({
    caId,
    name,
    commonName,
    subjectAlternativeName,
    ttl,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TCreateCertTemplateDTO) => {
    const ca = await certificateAuthorityDAL.findById(caId);
    if (!ca) {
      throw new NotFoundError({
        message: "CA not found"
      });
    }
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      ca.projectId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Create,
      ProjectPermissionSub.CertificateTemplates
    );

    const certificateTemplate = await certificateTemplateDAL.create({
      caId,
      name,
      commonName,
      subjectAlternativeName,
      ttl
    });

    return certificateTemplate;
  };

  const updateCertTemplate = async ({
    id,
    caId,
    name,
    commonName,
    subjectAlternativeName,
    ttl,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TUpdateCertTemplateDTO) => {
    const certTemplate = await certificateTemplateDAL.getById(id);
    if (!certTemplate) {
      throw new NotFoundError({
        message: "Certificate template not found."
      });
    }

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      certTemplate.projectId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Edit,
      ProjectPermissionSub.CertificateTemplates
    );

    if (caId) {
      const ca = await certificateAuthorityDAL.findById(caId);
      if (!ca || ca.projectId !== certTemplate.projectId) {
        throw new BadRequestError({
          message: "Invalid CA"
        });
      }
    }

    const updatedCertTemplate = await certificateTemplateDAL.updateById(certTemplate.id, {
      caId,
      commonName,
      subjectAlternativeName,
      name,
      ttl
    });

    return updatedCertTemplate;
  };

  const deleteCertTemplate = async ({ id, actorId, actorAuthMethod, actor, actorOrgId }: TDeleteCertTemplateDTO) => {
    const certTemplate = await certificateTemplateDAL.getById(id);
    if (!certTemplate) {
      throw new NotFoundError({
        message: "Certificate template not found."
      });
    }

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      certTemplate.projectId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Delete,
      ProjectPermissionSub.CertificateTemplates
    );

    const deletedCertTemplate = await certificateTemplateDAL.deleteById(certTemplate.id);

    return deletedCertTemplate;
  };

  const getCertTemplate = async ({ id, actorId, actorAuthMethod, actor, actorOrgId }: TGetCertTemplateDTO) => {
    const certTemplate = await certificateTemplateDAL.getById(id);
    if (!certTemplate) {
      throw new NotFoundError({
        message: "Certificate template not found."
      });
    }

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      certTemplate.projectId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      ProjectPermissionSub.CertificateTemplates
    );

    return certTemplate;
  };

  return {
    createCertTemplate,
    getCertTemplate,
    deleteCertTemplate,
    updateCertTemplate
  };
};
