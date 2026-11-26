import { Knex } from "knex";

import { ProjectType } from "@app/db/schemas";
import {
  ApplicationCertificatePermissionActions,
  ApplicationPermissionSub,
  TApplicationPermissionService
} from "@app/domains/certificates/cert-manager/ce/module";
import type { TActorContext } from "@app/domains/lib/actor-context";
import {
  ProjectPermissionCertificateActions,
  ProjectPermissionSub,
  ProjectPermission,
  TProjectPermissionService
} from "@app/domains/platform/projects/ce/module";
import { ActorType } from "@app/lib/auth/actor-types";

import { TResourceMetadataDALFactory } from "../resource-metadata/resource-metadata-dal";

// ACME, EST, SCEP and MS autoenrollment clients hold no project permissions, so they're checked against their
// profile instead of the permission functions.
export type TCertificateEnrollmentActor = {
  type:
    | ActorType.ACME_ACCOUNT
    | ActorType.EST_ACCOUNT
    | ActorType.SCEP_ACCOUNT
    | ActorType.MICROSOFT_AUTOENROLLMENT_ACCOUNT;
  // The ACME account, or the profile for EST, SCEP and Microsoft autoenrollment.
  id: string;
  orgId: string;
};

export type TCertificateIssuanceCaller =
  | { actor: TActorContext; enrollment?: undefined }
  | { actor?: undefined; enrollment: TCertificateEnrollmentActor };

// For writing issuance records (requester, telemetry, metadata org).
export const flatActorOfCaller = (caller: TCertificateIssuanceCaller) =>
  caller.actor
    ? { actor: caller.actor.principal.type, actorId: caller.actor.principal.id, actorOrgId: caller.actor.org.id }
    : { actor: caller.enrollment.type, actorId: caller.enrollment.id, actorOrgId: caller.enrollment.orgId };

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
  actor: TActorContext;
  projectPermissionService: TProjectPermissionService;
  applicationPermissionService: TApplicationPermissionService;
  resourceMetadataDAL: Pick<TResourceMetadataDALFactory, "find">;
  tx?: Knex;
};

const assertCertificatePermission = async ({
  certificate,
  actor,
  projectPermissionService,
  applicationPermissionService,
  resourceMetadataDAL,
  tx,
  resourceAction,
  projectAction,
  extraSubjectFields
}: TAssertCanEditCertificateDTO & {
  resourceAction: ApplicationCertificatePermissionActions;
  projectAction: ProjectPermissionCertificateActions;
  extraSubjectFields?: Record<string, string | undefined>;
}): Promise<{
  certMetadata: { key: string; value: string }[];
  projectPermission?: ProjectPermission;
}> => {
  if (certificate.applicationId) {
    const permission = await applicationPermissionService.getApplicationPermission({
      actor,
      projectId: certificate.projectId,
      applicationId: certificate.applicationId
    });
    permission.assert({ action: resourceAction, subject: ApplicationPermissionSub.Certificates });

    return { certMetadata: [] };
  }

  const metadataRows = await resourceMetadataDAL.find({ certificateId: certificate.id }, { tx });
  const certMetadata = metadataRows.map(({ key, value }) => ({ key, value: value || "" }));

  const permission = await projectPermissionService.getProjectPermission({
    actor,
    projectId: certificate.projectId,
    type: ProjectType.CertificateManager
  });

  permission.assert({
    action: projectAction,
    subject: ProjectPermissionSub.Certificates,
    fields: {
      commonName: certificate.commonName ?? undefined,
      altNames: certificate.altNames?.split(",").map((s) => s.trim()),
      serialNumber: certificate.serialNumber ?? undefined,
      ...extraSubjectFields,
      metadata: certMetadata
    }
  });

  return { certMetadata, projectPermission: permission };
};

export const assertCanEditCertificate = (dto: TAssertCanEditCertificateDTO) =>
  assertCertificatePermission({
    ...dto,
    resourceAction: ApplicationCertificatePermissionActions.Edit,
    projectAction: ProjectPermissionCertificateActions.Edit
  });

type TAssertCanRevokeCertificateDTO = Omit<TAssertCanEditCertificateDTO, "certificate"> & {
  certificate: TCertificateSubjectFields & { friendlyName?: string | null; status?: string | null };
};

export const assertCanRevokeCertificate = async ({ certificate, ...dto }: TAssertCanRevokeCertificateDTO) => {
  await assertCertificatePermission({
    ...dto,
    certificate,
    resourceAction: ApplicationCertificatePermissionActions.Delete,
    projectAction: ProjectPermissionCertificateActions.Delete,
    extraSubjectFields: {
      friendlyName: certificate.friendlyName ?? undefined,
      status: certificate.status ?? undefined
    }
  });
};

// An actor who can't revoke directly may still request a revocation, so the caller must refuse them
// unless a revocation approval policy covers the certificate.
export const assertCanRevokeOrRequestRevocation = async (
  dto: TAssertCanRevokeCertificateDTO
): Promise<{ canRevokeDirectly: boolean }> => {
  const { certificate } = dto;
  if (!certificate.applicationId) {
    await assertCanRevokeCertificate(dto);
    return { canRevokeDirectly: true };
  }

  const permission = await dto.applicationPermissionService.getApplicationPermission({
    actor: dto.actor,
    projectId: certificate.projectId,
    applicationId: certificate.applicationId
  });

  const canRevokeDirectly = permission.can({
    action: ApplicationCertificatePermissionActions.Delete,
    subject: ApplicationPermissionSub.Certificates
  });
  if (!canRevokeDirectly) {
    permission.assert({
      action: ApplicationCertificatePermissionActions.RequestRevocation,
      subject: ApplicationPermissionSub.Certificates
    });
  }

  return { canRevokeDirectly };
};

export const assertCanEditCertificateResult = ({
  projectPermission,
  commonName,
  altNames,
  serialNumber,
  metadata
}: {
  projectPermission: ProjectPermission;
  commonName?: string | null;
  altNames?: string[];
  serialNumber?: string | null;
  metadata: { key: string; value: string }[];
}) => {
  projectPermission.assert({
    action: ProjectPermissionCertificateActions.Edit,
    subject: ProjectPermissionSub.Certificates,
    fields: {
      commonName: commonName ?? undefined,
      altNames,
      serialNumber: serialNumber ?? undefined,
      metadata
    }
  });
};
