import { ForbiddenError } from "@casl/ability";

import { ActionProjectType, ProjectType, TableName } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { OrgServiceActor } from "@app/lib/types";

import { TProjectDALFactory } from "../project/project-dal";
import { TCertificateAuthorityDALFactory } from "./certificate-authority-dal";
import { CaType } from "./certificate-authority-enums";
import {
  TCertificateAuthority,
  TCreateCertificateAuthorityDTO,
  TUpdateCertificateAuthorityDTO
} from "./certificate-authority-types";
import { TInternalCertificateAuthorityServiceFactory } from "./internal/internal-certificate-authority-service";

type TCertificateAuthorityServiceFactoryDep = {
  certificateAuthorityDAL: Pick<
    TCertificateAuthorityDALFactory,
    | "transaction"
    | "create"
    | "findById"
    | "updateById"
    | "deleteById"
    | "findOne"
    | "findByIdWithAssociatedCa"
    | "findWithAssociatedCa"
  >;
  internalCertificateAuthorityService: TInternalCertificateAuthorityServiceFactory;
  projectDAL: Pick<
    TProjectDALFactory,
    "findProjectBySlug" | "findOne" | "updateById" | "findById" | "transaction" | "getProjectFromSplitId"
  >;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
};

export type TCertificateAuthorityServiceFactory = ReturnType<typeof certificateAuthorityServiceFactory>;

export const certificateAuthorityServiceFactory = ({
  certificateAuthorityDAL,
  projectDAL,
  permissionService,
  internalCertificateAuthorityService
}: TCertificateAuthorityServiceFactoryDep) => {
  const createCertificateAuthority = async (
    { type, projectId, configuration, disableDirectIssuance }: TCreateCertificateAuthorityDTO,
    actor: OrgServiceActor
  ) => {
    let finalProjectId: string = projectId;
    const certManagerProjectFromSplit = await projectDAL.getProjectFromSplitId(
      projectId,
      ProjectType.CertificateManager
    );

    if (certManagerProjectFromSplit) {
      finalProjectId = certManagerProjectFromSplit.id;
    }

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId: finalProjectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Create,
      ProjectPermissionSub.CertificateAuthorities
    );

    if (type === CaType.INTERNAL) {
      const ca = await internalCertificateAuthorityService.createCa({
        ...configuration,
        isInternal: true,
        projectId: finalProjectId,
        requireTemplateForIssuance: disableDirectIssuance
      });

      if (!ca.internalCa) {
        throw new BadRequestError({
          message: "Failed to create internal certificate authority"
        });
      }

      return {
        id: ca.id,
        type,
        disableDirectIssuance: ca.disableDirectIssuance,
        name: ca.internalCa?.friendlyName,
        projectId,
        configuration: ca.internalCa
      } as TCertificateAuthority;
    }
  };

  const findCertificateAuthorityById = async (
    { certificateAuthorityId, type }: { certificateAuthorityId: string; type: CaType },
    actor: OrgServiceActor
  ) => {
    const certificateAuthority = await certificateAuthorityDAL.findByIdWithAssociatedCa(certificateAuthorityId);

    if (!certificateAuthority)
      throw new NotFoundError({
        message: `Could not find certificate authority with ID "${certificateAuthorityId}"`
      });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId: certificateAuthority.projectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      ProjectPermissionSub.CertificateAuthorities
    );

    if (type === CaType.INTERNAL) {
      if (!certificateAuthority.internalCa) {
        throw new NotFoundError({
          message: `Could not find internal certificate authority with ID "${certificateAuthorityId}"`
        });
      }

      return {
        id: certificateAuthority.id,
        type,
        disableDirectIssuance: certificateAuthority.disableDirectIssuance,
        name: certificateAuthority.internalCa.friendlyName,
        projectId: certificateAuthority.projectId,
        configuration: certificateAuthority.internalCa
      } as TCertificateAuthority;
    }
  };

  const listCertificateAuthoritiesByProjectId = async (
    { projectId, type }: { projectId: string; type: CaType },
    actor: OrgServiceActor
  ) => {
    let finalProjectId: string = projectId;
    const certManagerProjectFromSplit = await projectDAL.getProjectFromSplitId(
      projectId,
      ProjectType.CertificateManager
    );

    if (certManagerProjectFromSplit) {
      finalProjectId = certManagerProjectFromSplit.id;
    }

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId: finalProjectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      ProjectPermissionSub.CertificateAuthorities
    );

    const cas = await certificateAuthorityDAL.findWithAssociatedCa({
      [`${TableName.CertificateAuthority}.projectId` as "projectId"]: finalProjectId,
      ...(type === CaType.INTERNAL && {
        $notNull: [`${TableName.InternalCertificateAuthority}.id` as "id"]
      }),
      ...(type !== CaType.INTERNAL && {
        [`${TableName.ExternalCertificateAuthority}.type` as "type"]: type
      })
    });

    if (type === CaType.INTERNAL) {
      return cas
        .filter((ca): ca is typeof ca & { internalCa: NonNullable<typeof ca.internalCa> } => Boolean(ca.internalCa))
        .map((ca) => ({
          id: ca.id,
          type,
          disableDirectIssuance: ca.disableDirectIssuance,
          name: ca.internalCa.friendlyName,
          projectId: ca.projectId,
          configuration: ca.internalCa
        })) as TCertificateAuthority[];
    }
  };

  const updateCertificateAuthority = async (
    { id, type, configuration, disableDirectIssuance }: TUpdateCertificateAuthorityDTO,
    actor: OrgServiceActor
  ) => {
    const certificateAuthority = await certificateAuthorityDAL.findByIdWithAssociatedCa(id);

    if (!certificateAuthority)
      throw new NotFoundError({
        message: `Could not find certificate authority with ID "${id}"`
      });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId: certificateAuthority.projectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Edit,
      ProjectPermissionSub.CertificateAuthorities
    );

    if (type === CaType.INTERNAL) {
      if (!certificateAuthority.internalCa) {
        throw new NotFoundError({
          message: `Could not find internal certificate authority with ID "${id}"`
        });
      }

      const updatedCa = await internalCertificateAuthorityService.updateCaById({
        ...configuration,
        isInternal: true,
        requireTemplateForIssuance: disableDirectIssuance,
        caId: id
      });

      if (!updatedCa.internalCa) {
        throw new BadRequestError({
          message: "Failed to update internal certificate authority"
        });
      }

      return {
        id: updatedCa.id,
        type,
        disableDirectIssuance: updatedCa.disableDirectIssuance,
        name: updatedCa.internalCa?.friendlyName,
        projectId: updatedCa.projectId,
        configuration: updatedCa.internalCa
      } as TCertificateAuthority;
    }
  };

  const deleteCertificateAuthority = async ({ id, type }: { id: string; type: CaType }, actor: OrgServiceActor) => {
    const certificateAuthority = await certificateAuthorityDAL.findByIdWithAssociatedCa(id);

    if (!certificateAuthority)
      throw new NotFoundError({
        message: `Could not find certificate authority with ID "${id}"`
      });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId: certificateAuthority.projectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Delete,
      ProjectPermissionSub.CertificateAuthorities
    );

    if (!certificateAuthority.internalCa && type === CaType.INTERNAL) {
      throw new BadRequestError({
        message: "Certificate authority cannot be deleted due to mismatching type"
      });
    }

    await certificateAuthorityDAL.deleteById(id);

    if (type === CaType.INTERNAL) {
      return {
        id: certificateAuthority.id,
        type,
        disableDirectIssuance: certificateAuthority.disableDirectIssuance,
        name: certificateAuthority.internalCa?.friendlyName,
        projectId: certificateAuthority.projectId,
        configuration: certificateAuthority.internalCa
      } as TCertificateAuthority;
    }
  };

  return {
    createCertificateAuthority,
    findCertificateAuthorityById,
    listCertificateAuthoritiesByProjectId,
    updateCertificateAuthority,
    deleteCertificateAuthority
  };
};
