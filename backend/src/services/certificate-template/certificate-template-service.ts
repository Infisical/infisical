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
    pkiCollectionId,
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

    const { id } = await certificateTemplateDAL.create({
      caId,
      pkiCollectionId,
      name,
      commonName,
      subjectAlternativeName,
      ttl
    });

    const certificateTemplate = await certificateTemplateDAL.getById(id);
    if (!certificateTemplate) {
      throw new NotFoundError({
        message: "Certificate template not found"
      });
    }

    return certificateTemplate;
  };

  const updateCertTemplate = async ({
    id,
    caId,
    pkiCollectionId,
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

    await certificateTemplateDAL.updateById(certTemplate.id, {
      caId,
      pkiCollectionId,
      commonName,
      subjectAlternativeName,
      name,
      ttl
    });

    const updatedTemplate = await certificateTemplateDAL.getById(id);
    if (!updatedTemplate) {
      throw new NotFoundError({
        message: "Certificate template not found"
      });
    }

    return updatedTemplate;
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

    await certificateTemplateDAL.deleteById(certTemplate.id);

    return certTemplate;
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
