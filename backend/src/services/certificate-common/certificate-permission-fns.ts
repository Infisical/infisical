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

export const assertCanEditCertificate = async ({
  certificate,
  actor,
  actorId,
  actorAuthMethod,
  actorOrgId,
  permissionService,
  resourceMetadataDAL,
  tx
}: TAssertCanEditCertificateDTO): Promise<{
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
    ForbiddenError.from(permission).throwUnlessCan(
      ResourcePermissionCertificateActions.Edit,
      ResourcePermissionSub.Certificates
    );

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
    ProjectPermissionCertificateActions.Edit,
    subject(ProjectPermissionSub.Certificates, {
      commonName: certificate.commonName ?? undefined,
      altNames: certificate.altNames?.split(",").map((s) => s.trim()),
      serialNumber: certificate.serialNumber ?? undefined,
      metadata: certMetadata
    })
  );

  return { certMetadata, projectPermission: permission };
};
