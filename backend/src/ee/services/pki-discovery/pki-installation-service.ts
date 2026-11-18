import { ForbiddenError } from "@casl/ability";

import { ActionProjectType, ResourceType } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionCertificateActions,
  ProjectPermissionPkiCertificateInstallationActions,
  ProjectPermissionPkiDiscoveryActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import {
  ResourcePermissionCertificateActions,
  ResourcePermissionSub
} from "@app/ee/services/permission/resource-permission";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import {
  buildCertificateBundleSubject,
  buildCertificateReadSubject,
  canReadCertificatePrivateKey
} from "@app/services/certificate/certificate-permission-fns";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

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
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getResourcePermission">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById">;
  queueInstallationRescan: (installationId: string) => Promise<void>;
};

export type TPkiInstallationServiceFactory = ReturnType<typeof pkiInstallationServiceFactory>;

export const pkiInstallationServiceFactory = ({
  pkiCertificateInstallationDAL,
  permissionService,
  kmsService,
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

  const getInstallation = async ({
    installationId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TGetPkiInstallationDTO) => {
    const installation = await pkiCertificateInstallationDAL.findByIdWithCertificates(installationId);
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

    const { connectionId } = (installation.locationDetails as TPkiInstallationLocationDetails | null) ?? {};
    const connection = connectionId ? await appConnectionDAL.findById(connectionId) : undefined;

    const loadApplicationPermission = (applicationId: string) =>
      permissionService
        .getResourcePermission({
          actor,
          actorId,
          projectId: installation.projectId,
          resourceType: ResourceType.CertificateApplication,
          resourceId: applicationId,
          actorAuthMethod,
          actorOrgId
        })
        .then(({ permission: appPermission }) => appPermission)
        .catch(() => null);
    const applicationPermissions = new Map<string, ReturnType<typeof loadApplicationPermission>>();
    const getApplicationPermission = (applicationId: string) => {
      let result = applicationPermissions.get(applicationId);
      if (!result) {
        result = loadApplicationPermission(applicationId);
        applicationPermissions.set(applicationId, result);
      }
      return result;
    };

    const certificates = await Promise.all(
      installation.certificates.map(async ({ metadata, ...cert }) => {
        const readSubject = buildCertificateReadSubject(cert, metadata);
        const bundleSubject = buildCertificateBundleSubject(cert, metadata);

        const appPermission = cert.applicationId ? await getApplicationPermission(cert.applicationId) : null;
        const canReadViaApplication = Boolean(
          appPermission?.can(ResourcePermissionCertificateActions.Read, ResourcePermissionSub.Certificates)
        );

        const canRead = permission.can(ProjectPermissionCertificateActions.Read, readSubject) || canReadViaApplication;

        const canReadBundle =
          permission.can(ProjectPermissionCertificateActions.Read, bundleSubject) || canReadViaApplication;
        const canReadPrivateKey = canReadCertificatePrivateKey({
          applicationId: cert.applicationId,
          projectPermission: permission,
          applicationPermission: appPermission,
          certSubject: bundleSubject
        });
        const canExportPkcs12 = cert.hasPrivateKey && canReadBundle && canReadPrivateKey;

        return { ...cert, canRead, canExportPkcs12 };
      })
    );

    return {
      ...sanitizePkiInstallation({ ...installation, certificates }),
      connection: connection && connection.orgId === actorOrgId ? { id: connection.id, name: connection.name } : null
    };
  };

  const updateInstallation = async ({
    installationId,
    name,
    keystorePassword,
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

    const isSettingPassword = typeof keystorePassword === "string";
    if (isSettingPassword) {
      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionPkiDiscoveryActions.RunScan,
        ProjectPermissionSub.PkiDiscovery
      );
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
              kmsService
            });
    }

    const updatedInstallation = await pkiCertificateInstallationDAL.updateById(installationId, updateData);

    if (isSettingPassword) {
      await queueInstallationRescan(installationId);
    }

    return sanitizePkiInstallation(updatedInstallation);
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

    return sanitizePkiInstallation(installation);
  };

  return {
    listInstallations,
    getInstallation,
    updateInstallation,
    deleteInstallation
  };
};
