import { ForbiddenError } from "@casl/ability";
import ms from "ms";

import {
  OrgPermissionSshCertificateTemplateActions,
  OrgPermissionSubjects
} from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { BadRequestError, NotFoundError } from "@app/lib/errors";

import { TSshCertificateAuthorityDALFactory } from "../ssh/ssh-certificate-authority-dal";
import { TSshCertificateTemplateDALFactory } from "./ssh-certificate-template-dal";
import {
  TCreateSshCertTemplateDTO,
  TDeleteSshCertTemplateDTO,
  TGetSshCertTemplateDTO,
  TUpdateSshCertTemplateDTO
} from "./ssh-certificate-template-types";

type TSshCertificateTemplateServiceFactoryDep = {
  sshCertificateTemplateDAL: TSshCertificateTemplateDALFactory;
  sshCertificateAuthorityDAL: Pick<TSshCertificateAuthorityDALFactory, "findById">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
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

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      ca.orgId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionSshCertificateTemplateActions.Create,
      OrgPermissionSubjects.SshCertificateTemplates
    );

    const existingTemplate = await sshCertificateTemplateDAL.getByName(name, ca.orgId);
    if (existingTemplate) {
      throw new BadRequestError({
        message: `SSH certificate template with name ${name} already exists`
      });
    }

    if (ms(ttl) > ms(maxTTL)) {
      throw new BadRequestError({
        message: "TTL cannot be greater than max TTL"
      });
    }

    const certificateTemplate = await sshCertificateTemplateDAL.create({
      sshCaId,
      name,
      ttl,
      maxTTL,
      allowUserCertificates,
      allowHostCertificates,
      allowedUsers,
      allowedHosts,
      allowCustomKeyIds
    });

    return { certificateTemplate, ca };
  };

  const updateSshCertTemplate = async ({
    id,
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

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      certTemplate.orgId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionSshCertificateTemplateActions.Edit,
      OrgPermissionSubjects.SshCertificateTemplates
    );

    if (name) {
      const existingTemplate = await sshCertificateTemplateDAL.getByName(name, actorOrgId);
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

    const certificateTemplate = await sshCertificateTemplateDAL.updateById(id, {
      name,
      ttl,
      maxTTL,
      allowUserCertificates,
      allowHostCertificates,
      allowedUsers,
      allowedHosts,
      allowCustomKeyIds
    });

    return {
      certificateTemplate,
      orgId: certTemplate.orgId
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

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      certificateTemplate.orgId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionSshCertificateTemplateActions.Delete,
      OrgPermissionSubjects.SshCertificateTemplates
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

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      certTemplate.orgId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionSshCertificateTemplateActions.Read,
      OrgPermissionSubjects.SshCertificateTemplates
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
