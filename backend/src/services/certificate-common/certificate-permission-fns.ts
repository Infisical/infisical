import { ForbiddenError, MongoAbility, subject } from "@casl/ability";
import { Knex } from "knex";

import { ActionProjectType, ResourceType } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionCertificateActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import {
  ResourcePermissionCertificateActions,
  ResourcePermissionSub
} from "@app/ee/services/permission/resource-permission";
import { ActorAuthMethod, ActorType } from "@app/services/auth/auth-type";

import { TResourceMetadataDALFactory } from "../resource-metadata/resource-metadata-dal";

type TCertificateSubjectFields = {
  id: string;
  projectId: string;
  applicationId?: string | null;
  commonName?: string | null;
  altNames?: string | null;
  serialNumber?: string | null;
};

type TAssertCanEditCertificateDTO = {
  certificate: TCertificateSubjectFields;
  actor: ActorType;
  actorId: string;
  actorAuthMethod: ActorAuthMethod;
  actorOrgId: string;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getResourcePermission">;
  resourceMetadataDAL: Pick<TResourceMetadataDALFactory, "find">;
  tx?: Knex;
};

const assertCertificatePermission = async ({
  certificate,
  actor,
  actorId,
  actorAuthMethod,
  actorOrgId,
  permissionService,
  resourceMetadataDAL,
  tx,
  resourceAction,
  projectAction,
  extraSubjectFields
}: TAssertCanEditCertificateDTO & {
  resourceAction: ResourcePermissionCertificateActions;
  projectAction: ProjectPermissionCertificateActions;
  extraSubjectFields?: Record<string, string | undefined>;
}): Promise<{
  certMetadata: { key: string; value: string }[];
  projectPermission?: MongoAbility;
}> => {
  if (certificate.applicationId) {
    const { permission } = await permissionService.getResourcePermission({
      actor,
      actorId,
      projectId: certificate.projectId,
      resourceType: ResourceType.CertificateApplication,
      resourceId: certificate.applicationId,
      actorAuthMethod,
      actorOrgId
    });
    ForbiddenError.from(permission).throwUnlessCan(resourceAction, ResourcePermissionSub.Certificates);

    return { certMetadata: [] };
  }

  const metadataRows = await resourceMetadataDAL.find({ certificateId: certificate.id }, { tx });
  const certMetadata = metadataRows.map(({ key, value }) => ({ key, value: value || "" }));

  const { permission } = await permissionService.getProjectPermission({
    actor,
    actorId,
    projectId: certificate.projectId,
    actorAuthMethod,
    actorOrgId,
    actionProjectType: ActionProjectType.CertificateManager
  });

  ForbiddenError.from(permission).throwUnlessCan(
    projectAction,
    subject(ProjectPermissionSub.Certificates, {
      commonName: certificate.commonName ?? undefined,
      altNames: certificate.altNames?.split(",").map((s) => s.trim()),
      serialNumber: certificate.serialNumber ?? undefined,
      ...extraSubjectFields,
      metadata: certMetadata
    })
  );

  return { certMetadata, projectPermission: permission };
};

export const assertCanEditCertificate = (dto: TAssertCanEditCertificateDTO) =>
  assertCertificatePermission({
    ...dto,
    resourceAction: ResourcePermissionCertificateActions.Edit,
    projectAction: ProjectPermissionCertificateActions.Edit
  });

export const assertCanRevokeCertificate = async ({
  certificate,
  ...dto
}: Omit<TAssertCanEditCertificateDTO, "certificate"> & {
  certificate: TCertificateSubjectFields & { friendlyName?: string | null; status?: string | null };
}) => {
  await assertCertificatePermission({
    ...dto,
    certificate,
    resourceAction: ResourcePermissionCertificateActions.Delete,
    projectAction: ProjectPermissionCertificateActions.Delete,
    extraSubjectFields: {
      friendlyName: certificate.friendlyName ?? undefined,
      status: certificate.status ?? undefined
    }
  });
};

export const assertCanEditCertificateResult = ({
  projectPermission,
  commonName,
  altNames,
  serialNumber,
  metadata
}: {
  projectPermission: MongoAbility;
  commonName?: string | null;
  altNames?: string[];
  serialNumber?: string | null;
  metadata: { key: string; value: string }[];
}) => {
  ForbiddenError.from(projectPermission).throwUnlessCan(
    ProjectPermissionCertificateActions.Edit,
    subject(ProjectPermissionSub.Certificates, {
      commonName: commonName ?? undefined,
      altNames,
      serialNumber: serialNumber ?? undefined,
      metadata
    })
  );
};
