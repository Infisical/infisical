import { ProjectType } from "@app/db/schemas";
import { TKmsCoreDomain } from "@app/domains/platform/kms-core/ce/module";
import {
  ProjectPermissionPkiCertificateInstallationActions,
  ProjectPermissionPkiDiscoveryActions,
  ProjectPermissionSub,
  TProjectsDomain
} from "@app/domains/platform/projects/ce/module";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";

import { TPkiCertificateInstallationDALFactory } from "./pki-certificate-installation-dal";
import {
  PkiCertificateFileFormat,
  PkiInstallationLocationType,
  TDeletePkiInstallationDTO,
  TGetPkiInstallationDTO,
  TListPkiInstallationsDTO,
  TPkiInstallationLocationDetails,
  TUpdatePkiInstallationDTO
} from "./pki-discovery-types";
import { encryptPkiInstallationCredentials } from "./pki-installation-credentials-fns";

export const sanitizePkiInstallation = <T extends { encryptedCredentials?: Buffer | null }>(installation: T) => {
  const { encryptedCredentials, ...rest } = installation;
  return { ...rest, hasKeystorePassword: Boolean(encryptedCredentials) };
};

type TPkiInstallationServiceFactoryDep = {
  pkiCertificateInstallationDAL: Pick<
    TPkiCertificateInstallationDALFactory,
    "findById" | "findByProjectId" | "countByProjectId" | "findByIdWithCertificates" | "updateById" | "deleteById"
  >;
  projectsDomain: Pick<TProjectsDomain, "getProjectPermission">;
  kmsCoreDomain: TKmsCoreDomain;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById">;
  queueInstallationRescan: (installationId: string) => Promise<void>;
};

export type TPkiInstallationServiceFactory = ReturnType<typeof pkiInstallationServiceFactory>;

export const pkiInstallationServiceFactory = ({
  pkiCertificateInstallationDAL,
  projectsDomain,
  kmsCoreDomain,
  appConnectionDAL,
  queueInstallationRescan
}: TPkiInstallationServiceFactoryDep) => {
  const listInstallations = async ({
    projectId,
    discoveryId,
    certificateId,
    offset,
    limit,
    search,
    actor
  }: TListPkiInstallationsDTO) => {
    const permission = await projectsDomain.getProjectPermission({
      actor,
      projectId,
      type: ProjectType.CertificateManager
    });

    permission.assert({
      action: ProjectPermissionPkiCertificateInstallationActions.Read,
      subject: ProjectPermissionSub.PkiCertificateInstallations
    });

    const installations = await pkiCertificateInstallationDAL.findByProjectId(projectId, {
      offset,
      limit,
      discoveryId,
      certificateId,
      search
    });
    const totalCount = await pkiCertificateInstallationDAL.countByProjectId(projectId, {
      discoveryId,
      certificateId,
      search
    });

    return { installations: installations.map(sanitizePkiInstallation), totalCount };
  };

  const getInstallation = async ({ installationId, actor }: TGetPkiInstallationDTO) => {
    const installation = await pkiCertificateInstallationDAL.findByIdWithCertificates(installationId);
    if (!installation) {
      throw new NotFoundError({ message: `Installation with ID '${installationId}' not found` });
    }

    const permission = await projectsDomain.getProjectPermission({
      actor,
      projectId: installation.projectId,
      type: ProjectType.CertificateManager
    });

    permission.assert({
      action: ProjectPermissionPkiCertificateInstallationActions.Read,
      subject: ProjectPermissionSub.PkiCertificateInstallations
    });

    const { connectionId } = (installation.locationDetails as TPkiInstallationLocationDetails | null) ?? {};
    const connection = connectionId ? await appConnectionDAL.findById(connectionId) : undefined;

    return {
      ...sanitizePkiInstallation(installation),
      connection: connection && connection.orgId === actor.org.id ? { id: connection.id, name: connection.name } : null
    };
  };

  const updateInstallation = async ({ installationId, name, keystorePassword, actor }: TUpdatePkiInstallationDTO) => {
    const installation = await pkiCertificateInstallationDAL.findById(installationId);
    if (!installation) {
      throw new NotFoundError({ message: `Installation with ID '${installationId}' not found` });
    }

    const permission = await projectsDomain.getProjectPermission({
      actor,
      projectId: installation.projectId,
      type: ProjectType.CertificateManager
    });

    permission.assert({
      action: ProjectPermissionPkiCertificateInstallationActions.Edit,
      subject: ProjectPermissionSub.PkiCertificateInstallations
    });

    const isSettingPassword = typeof keystorePassword === "string";
    if (isSettingPassword) {
      permission.assert({
        action: ProjectPermissionPkiDiscoveryActions.RunScan,
        subject: ProjectPermissionSub.PkiDiscovery
      });
    }

    if (keystorePassword !== undefined && installation.locationType !== PkiInstallationLocationType.Keystore) {
      throw new BadRequestError({
        message: `Installation '${installation.name ?? installationId}' is not a keystore, so it has no password to set`
      });
    }

    const installationFormat = (installation.locationDetails as TPkiInstallationLocationDetails | null)?.format;
    if (isSettingPassword && installationFormat && installationFormat !== PkiCertificateFileFormat.Pkcs12) {
      throw new BadRequestError({
        message: `Installation '${installation.name ?? installationId}' is a ${installationFormat.toUpperCase()} keystore, which is read without a password`
      });
    }

    const updateData: { name?: string; encryptedCredentials?: Buffer | null } = {};
    if (name !== undefined) updateData.name = name;
    if (keystorePassword !== undefined) {
      updateData.encryptedCredentials =
        keystorePassword === null
          ? null
          : await encryptPkiInstallationCredentials({
              projectId: installation.projectId,
              credentials: { keystorePassword },
              kmsCoreDomain
            });
    }

    const updatedInstallation = await pkiCertificateInstallationDAL.updateById(installationId, updateData);

    if (isSettingPassword) {
      await queueInstallationRescan(installationId);
    }

    return sanitizePkiInstallation(updatedInstallation);
  };

  const deleteInstallation = async ({ installationId, actor }: TDeletePkiInstallationDTO) => {
    const installation = await pkiCertificateInstallationDAL.findById(installationId);
    if (!installation) {
      throw new NotFoundError({ message: `Installation with ID '${installationId}' not found` });
    }

    const permission = await projectsDomain.getProjectPermission({
      actor,
      projectId: installation.projectId,
      type: ProjectType.CertificateManager
    });

    permission.assert({
      action: ProjectPermissionPkiCertificateInstallationActions.Delete,
      subject: ProjectPermissionSub.PkiCertificateInstallations
    });

    await pkiCertificateInstallationDAL.deleteById(installationId);

    return sanitizePkiInstallation(installation);
  };

  return {
    listInstallations,
    getInstallation,
    updateInstallation,
    deleteInstallation
  };
};
