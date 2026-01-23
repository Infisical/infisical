import { ForbiddenError } from "@casl/ability";

import { ActionProjectType } from "@app/db/schemas/models";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { ms } from "@app/lib/ms";

import { TSshCertificateAuthorityDALFactory } from "../ssh/ssh-certificate-authority-dal";
import { TSshCertificateTemplateDALFactory } from "./ssh-certificate-template-dal";
import {
  SshCertTemplateStatus,
  TCreateSshCertTemplateDTO,
  TDeleteSshCertTemplateDTO,
  TGetSshCertTemplateDTO,
  TUpdateSshCertTemplateDTO
} from "./ssh-certificate-template-types";

type TSshCertificateTemplateServiceFactoryDep = {
  sshCertificateTemplateDAL: Pick<
    TSshCertificateTemplateDALFactory,
    "transaction" | "getByName" | "create" | "updateById" | "deleteById" | "getById"
  >;
  sshCertificateAuthorityDAL: Pick<TSshCertificateAuthorityDALFactory, "findById">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
};

export type TSshCertificateTemplateServiceFactory = ReturnType<typeof sshCertificateTemplateServiceFactory>;

export const sshCertificateTemplateServiceFactory = ({
  sshCertificateTemplateDAL,
  sshCertificateAuthorityDAL,
  permissionService
}: TSshCertificateTemplateServiceFactoryDep) => {
  const createSshCertTemplate = async ({
    sshCaId,
    name,
    ttl,
    maxTTL,
    allowUserCertificates,
    allowHostCertificates,
    allowedUsers,
    allowedHosts,
    allowCustomKeyIds,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TCreateSshCertTemplateDTO) => {
    const ca = await sshCertificateAuthorityDAL.findById(sshCaId);
    if (!ca) {
      throw new NotFoundError({
        message: `SSH CA with ID ${sshCaId} not found`
      });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: ca.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SSH
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Create,
      ProjectPermissionSub.SshCertificateTemplates
    );

    if (ms(ttl) > ms(maxTTL)) {
      throw new BadRequestError({
        message: "TTL cannot be greater than max TTL"
      });
    }

    const newCertificateTemplate = await sshCertificateTemplateDAL.transaction(async (tx) => {
      const existingTemplate = await sshCertificateTemplateDAL.getByName(name, ca.projectId, tx);
      if (existingTemplate) {
        throw new BadRequestError({
          message: `SSH certificate template with name ${name} already exists`
        });
      }

      const certificateTemplate = await sshCertificateTemplateDAL.create(
        {
          sshCaId,
          name,
          ttl,
          maxTTL,
          allowUserCertificates,
          allowHostCertificates,
          allowedUsers,
          allowedHosts,
          allowCustomKeyIds,
          status: SshCertTemplateStatus.ACTIVE
        },
        tx
      );

      return certificateTemplate;
    });

    return { certificateTemplate: newCertificateTemplate, ca };
  };

  const updateSshCertTemplate = async ({
    id,
    status,
    name,
    ttl,
    maxTTL,
    allowUserCertificates,
    allowHostCertificates,
    allowedUsers,
    allowedHosts,
    allowCustomKeyIds,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TUpdateSshCertTemplateDTO) => {
    const certTemplate = await sshCertificateTemplateDAL.getById(id);
    if (!certTemplate) {
      throw new NotFoundError({
        message: `SSH certificate template with ID ${id} not found`
      });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: certTemplate.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SSH
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Edit,
      ProjectPermissionSub.SshCertificateTemplates
    );

    const updatedCertificateTemplate = await sshCertificateTemplateDAL.transaction(async (tx) => {
      if (name) {
        const existingTemplate = await sshCertificateTemplateDAL.getByName(name, certTemplate.projectId, tx);
        if (existingTemplate && existingTemplate.id !== id) {
          throw new BadRequestError({
            message: `SSH certificate template with name ${name} already exists`
          });
        }
      }

      if (ms(ttl || certTemplate.ttl) > ms(maxTTL || certTemplate.maxTTL)) {
        throw new BadRequestError({
          message: "TTL cannot be greater than max TTL"
        });
      }

      const certificateTemplate = await sshCertificateTemplateDAL.updateById(
        id,
        {
          status,
          name,
          ttl,
          maxTTL,
          allowUserCertificates,
          allowHostCertificates,
          allowedUsers,
          allowedHosts,
          allowCustomKeyIds
        },
        tx
      );

      return certificateTemplate;
    });

    return {
      certificateTemplate: updatedCertificateTemplate,
      projectId: certTemplate.projectId
    };
  };

  const deleteSshCertTemplate = async ({
    id,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TDeleteSshCertTemplateDTO) => {
    const certificateTemplate = await sshCertificateTemplateDAL.getById(id);
    if (!certificateTemplate) {
      throw new NotFoundError({
        message: `SSH certificate template with ID ${id} not found`
      });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: certificateTemplate.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SSH
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Delete,
      ProjectPermissionSub.SshCertificateTemplates
    );

    await sshCertificateTemplateDAL.deleteById(certificateTemplate.id);

    return certificateTemplate;
  };

  const getSshCertTemplate = async ({ id, actorId, actorAuthMethod, actor, actorOrgId }: TGetSshCertTemplateDTO) => {
    const certTemplate = await sshCertificateTemplateDAL.getById(id);
    if (!certTemplate) {
      throw new NotFoundError({
        message: `SSH certificate template with ID ${id} not found`
      });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: certTemplate.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SSH
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      ProjectPermissionSub.SshCertificateTemplates
    );

    return certTemplate;
  };

  return {
    createSshCertTemplate,
    updateSshCertTemplate,
    deleteSshCertTemplate,
    getSshCertTemplate
  };
};
