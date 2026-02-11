import { ForbiddenError } from "@casl/ability";

import { ActionProjectType } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionPkiCertificateInstallationActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { NotFoundError } from "@app/lib/errors";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";

import { TPkiCertificateInstallationDALFactory } from "./pki-certificate-installation-dal";
import {
  TDeletePkiInstallationDTO,
  TGetPkiInstallationDTO,
  TGetPkiInstallationsByCertificateIdDTO,
  TListPkiInstallationsDTO,
  TUpdatePkiInstallationDTO
} from "./pki-discovery-types";

type TPkiInstallationServiceFactoryDep = {
  pkiCertificateInstallationDAL: Pick<
    TPkiCertificateInstallationDALFactory,
    | "findById"
    | "findByProjectId"
    | "countByProjectId"
    | "findByIdWithCertificates"
    | "findByCertificateId"
    | "updateById"
    | "deleteById"
  >;
  certificateDAL: Pick<TCertificateDALFactory, "findById">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
};

export type TPkiInstallationServiceFactory = ReturnType<typeof pkiInstallationServiceFactory>;

export const pkiInstallationServiceFactory = ({
  pkiCertificateInstallationDAL,
  certificateDAL,
  permissionService
}: TPkiInstallationServiceFactoryDep) => {
  const listInstallations = async ({
    projectId,
    discoveryId,
    offset,
    limit,
    search,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TListPkiInstallationsDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPkiCertificateInstallationActions.Read,
      ProjectPermissionSub.PkiCertificateInstallations
    );

    const installations = await pkiCertificateInstallationDAL.findByProjectId(projectId, {
      offset,
      limit,
      discoveryId,
      search
    });
    const totalCount = await pkiCertificateInstallationDAL.countByProjectId(projectId, { discoveryId, search });

    return { installations, totalCount };
  };

  const getInstallation = async ({
    installationId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TGetPkiInstallationDTO) => {
    const installation = await pkiCertificateInstallationDAL.findByIdWithCertificates(installationId, {
      includeAllCerts: true
    });
    if (!installation) {
      throw new NotFoundError({ message: `Installation with ID '${installationId}' not found` });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: installation.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPkiCertificateInstallationActions.Read,
      ProjectPermissionSub.PkiCertificateInstallations
    );

    return installation;
  };

  const updateInstallation = async ({
    installationId,
    name,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TUpdatePkiInstallationDTO) => {
    const installation = await pkiCertificateInstallationDAL.findById(installationId);
    if (!installation) {
      throw new NotFoundError({ message: `Installation with ID '${installationId}' not found` });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: installation.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPkiCertificateInstallationActions.Edit,
      ProjectPermissionSub.PkiCertificateInstallations
    );

    const updateData: { name?: string } = {};
    if (name !== undefined) updateData.name = name;

    const updatedInstallation = await pkiCertificateInstallationDAL.updateById(installationId, updateData);

    return updatedInstallation;
  };

  const deleteInstallation = async ({
    installationId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TDeletePkiInstallationDTO) => {
    const installation = await pkiCertificateInstallationDAL.findById(installationId);
    if (!installation) {
      throw new NotFoundError({ message: `Installation with ID '${installationId}' not found` });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: installation.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPkiCertificateInstallationActions.Delete,
      ProjectPermissionSub.PkiCertificateInstallations
    );

    await pkiCertificateInstallationDAL.deleteById(installationId);

    return installation;
  };

  const getInstallationsByCertificateId = async ({
    certificateId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TGetPkiInstallationsByCertificateIdDTO) => {
    const certificate = await certificateDAL.findById(certificateId);
    if (!certificate) {
      throw new NotFoundError({ message: `Certificate with ID '${certificateId}' not found` });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: certificate.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPkiCertificateInstallationActions.Read,
      ProjectPermissionSub.PkiCertificateInstallations
    );

    const installations = await pkiCertificateInstallationDAL.findByCertificateId(certificateId);

    return { installations, projectId: certificate.projectId };
  };

  return {
    listInstallations,
    getInstallation,
    updateInstallation,
    deleteInstallation,
    getInstallationsByCertificateId
  };
};
