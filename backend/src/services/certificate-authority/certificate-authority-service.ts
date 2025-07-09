import { ForbiddenError } from "@casl/ability";

import { TableName } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { OrgServiceActor } from "@app/lib/types";

import { TAppConnectionDALFactory } from "../app-connection/app-connection-dal";
import { TAppConnectionServiceFactory } from "../app-connection/app-connection-service";
import { TCertificateBodyDALFactory } from "../certificate/certificate-body-dal";
import { TCertificateDALFactory } from "../certificate/certificate-dal";
import { TCertificateSecretDALFactory } from "../certificate/certificate-secret-dal";
import { TKmsServiceFactory } from "../kms/kms-service";
import { TPkiSubscriberDALFactory } from "../pki-subscriber/pki-subscriber-dal";
import { TProjectDALFactory } from "../project/project-dal";
import {
  AcmeCertificateAuthorityFns,
  castDbEntryToAcmeCertificateAuthority
} from "./acme/acme-certificate-authority-fns";
import {
  TCreateAcmeCertificateAuthorityDTO,
  TUpdateAcmeCertificateAuthorityDTO
} from "./acme/acme-certificate-authority-types";
import { TCertificateAuthorityDALFactory } from "./certificate-authority-dal";
import { CaType } from "./certificate-authority-enums";
import {
  TCertificateAuthority,
  TCreateCertificateAuthorityDTO,
  TUpdateCertificateAuthorityDTO
} from "./certificate-authority-types";
import { TExternalCertificateAuthorityDALFactory } from "./external-certificate-authority-dal";
import { TInternalCertificateAuthorityServiceFactory } from "./internal/internal-certificate-authority-service";
import { TCreateInternalCertificateAuthorityDTO } from "./internal/internal-certificate-authority-types";

type TCertificateAuthorityServiceFactoryDep = {
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById" | "update">;
  appConnectionService: Pick<TAppConnectionServiceFactory, "connectAppConnectionById">;
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
    | "findByNameAndProjectIdWithAssociatedCa"
  >;
  externalCertificateAuthorityDAL: Pick<TExternalCertificateAuthorityDALFactory, "create" | "update">;
  internalCertificateAuthorityService: TInternalCertificateAuthorityServiceFactory;
  projectDAL: Pick<TProjectDALFactory, "findProjectBySlug" | "findOne" | "updateById" | "findById" | "transaction">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  certificateDAL: Pick<TCertificateDALFactory, "create" | "transaction">;
  certificateBodyDAL: Pick<TCertificateBodyDALFactory, "create">;
  certificateSecretDAL: Pick<TCertificateSecretDALFactory, "create">;
  kmsService: Pick<
    TKmsServiceFactory,
    "encryptWithKmsKey" | "generateKmsKey" | "createCipherPairWithDataKey" | "decryptWithKmsKey"
  >;
  pkiSubscriberDAL: Pick<TPkiSubscriberDALFactory, "findById">;
};

export type TCertificateAuthorityServiceFactory = ReturnType<typeof certificateAuthorityServiceFactory>;

export const certificateAuthorityServiceFactory = ({
  certificateAuthorityDAL,
  projectDAL,
  permissionService,
  internalCertificateAuthorityService,
  appConnectionDAL,
  appConnectionService,
  externalCertificateAuthorityDAL,
  certificateDAL,
  certificateBodyDAL,
  certificateSecretDAL,
  kmsService,
  pkiSubscriberDAL
}: TCertificateAuthorityServiceFactoryDep) => {
  const acmeFns = AcmeCertificateAuthorityFns({
    appConnectionDAL,
    appConnectionService,
    certificateAuthorityDAL,
    externalCertificateAuthorityDAL,
    certificateDAL,
    certificateBodyDAL,
    certificateSecretDAL,
    kmsService,
    pkiSubscriberDAL,
    projectDAL
  });

  const createCertificateAuthority = async (
    { type, projectId, name, enableDirectIssuance, configuration, status }: TCreateCertificateAuthorityDTO,
    actor: OrgServiceActor
  ) => {
    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Create,
      ProjectPermissionSub.CertificateAuthorities
    );

    if (type === CaType.INTERNAL) {
      const ca = await internalCertificateAuthorityService.createCa({
        ...(configuration as TCreateInternalCertificateAuthorityDTO["configuration"]),
        isInternal: true,
        projectId,
        enableDirectIssuance,
        name
      });

      if (!ca.internalCa) {
        throw new BadRequestError({
          message: "Failed to create internal certificate authority"
        });
      }

      return {
        id: ca.id,
        type,
        enableDirectIssuance: ca.enableDirectIssuance,
        name: ca.name,
        projectId,
        status,
        configuration: ca.internalCa
      } as TCertificateAuthority;
    }

    if (type === CaType.ACME) {
      return acmeFns.createCertificateAuthority({
        name,
        projectId,
        configuration: configuration as TCreateAcmeCertificateAuthorityDTO["configuration"],
        enableDirectIssuance,
        status,
        actor
      });
    }

    throw new BadRequestError({ message: "Invalid certificate authority type" });
  };

  const findCertificateAuthorityByNameAndProjectId = async (
    { caName, type, projectId }: { caName: string; type: CaType; projectId: string },
    actor: OrgServiceActor
  ) => {
    const certificateAuthority = await certificateAuthorityDAL.findByNameAndProjectIdWithAssociatedCa(
      caName,
      projectId
    );

    if (!certificateAuthority)
      throw new NotFoundError({
        message: `Could not find certificate authority with name "${caName}" in project "${projectId}"`
      });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId: certificateAuthority.projectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      ProjectPermissionSub.CertificateAuthorities
    );

    if (type === CaType.INTERNAL) {
      if (!certificateAuthority.internalCa?.id) {
        throw new NotFoundError({
          message: `Internal certificate authority with name "${caName}" in project "${projectId}" not found`
        });
      }

      return {
        id: certificateAuthority.id,
        type,
        enableDirectIssuance: certificateAuthority.enableDirectIssuance,
        name: certificateAuthority.name,
        projectId: certificateAuthority.projectId,
        configuration: certificateAuthority.internalCa,
        status: certificateAuthority.status
      } as TCertificateAuthority;
    }

    if (certificateAuthority.externalCa?.type !== type) {
      throw new NotFoundError({
        message: `Could not find external certificate authority with name "${caName}" in project "${projectId}" and type "${type}"`
      });
    }

    if (type === CaType.ACME) {
      return castDbEntryToAcmeCertificateAuthority(certificateAuthority);
    }

    throw new BadRequestError({ message: "Invalid certificate authority type" });
  };

  const listCertificateAuthoritiesByProjectId = async (
    { projectId, type }: { projectId: string; type: CaType },
    actor: OrgServiceActor
  ) => {
    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      ProjectPermissionSub.CertificateAuthorities
    );

    if (type === CaType.INTERNAL) {
      const cas = await certificateAuthorityDAL.findWithAssociatedCa({
        [`${TableName.CertificateAuthority}.projectId` as "projectId"]: projectId,
        $notNull: [`${TableName.InternalCertificateAuthority}.id` as "id"]
      });

      return cas
        .filter((ca): ca is typeof ca & { internalCa: NonNullable<typeof ca.internalCa> } => Boolean(ca.internalCa))
        .map((ca) => ({
          id: ca.id,
          type,
          enableDirectIssuance: ca.enableDirectIssuance,
          name: ca.name,
          projectId: ca.projectId,
          configuration: ca.internalCa,
          status: ca.status
        })) as TCertificateAuthority[];
    }

    if (type === CaType.ACME) {
      return acmeFns.listCertificateAuthorities({ projectId });
    }

    throw new BadRequestError({ message: "Invalid certificate authority type" });
  };

  const updateCertificateAuthority = async (
    { caName, type, configuration, enableDirectIssuance, status, name, projectId }: TUpdateCertificateAuthorityDTO,
    actor: OrgServiceActor
  ) => {
    const certificateAuthority = await certificateAuthorityDAL.findByNameAndProjectIdWithAssociatedCa(
      caName,
      projectId
    );

    if (!certificateAuthority)
      throw new NotFoundError({
        message: `Could not find certificate authority with name "${caName}" in project "${projectId}"`
      });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId: certificateAuthority.projectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Edit,
      ProjectPermissionSub.CertificateAuthorities
    );

    if (type === CaType.INTERNAL) {
      if (!certificateAuthority.internalCa?.id) {
        throw new NotFoundError({
          message: `Internal certificate authority with name "${caName}" in project "${projectId}" not found`
        });
      }

      const updatedCa = await internalCertificateAuthorityService.updateCaById({
        isInternal: true,
        enableDirectIssuance,
        caId: certificateAuthority.id,
        status,
        name
      });

      if (!updatedCa.internalCa) {
        throw new BadRequestError({
          message: "Failed to update internal certificate authority"
        });
      }

      return {
        id: updatedCa.id,
        type,
        enableDirectIssuance: updatedCa.enableDirectIssuance,
        name: updatedCa.name,
        projectId: updatedCa.projectId,
        configuration: updatedCa.internalCa,
        status: updatedCa.status
      } as TCertificateAuthority;
    }

    if (type === CaType.ACME) {
      return acmeFns.updateCertificateAuthority({
        id: certificateAuthority.id,
        configuration: configuration as TUpdateAcmeCertificateAuthorityDTO["configuration"],
        enableDirectIssuance,
        actor,
        status,
        name
      });
    }

    throw new BadRequestError({ message: "Invalid certificate authority type" });
  };

  const deleteCertificateAuthority = async (
    { caName, type, projectId }: { caName: string; type: CaType; projectId: string },
    actor: OrgServiceActor
  ) => {
    const certificateAuthority = await certificateAuthorityDAL.findByNameAndProjectIdWithAssociatedCa(
      caName,
      projectId
    );

    if (!certificateAuthority)
      throw new NotFoundError({
        message: `Could not find certificate authority with name "${caName}" in project "${projectId}"`
      });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId: certificateAuthority.projectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Delete,
      ProjectPermissionSub.CertificateAuthorities
    );

    if (!certificateAuthority.internalCa?.id && type === CaType.INTERNAL) {
      throw new BadRequestError({
        message: "Internal certificate authority cannot be deleted"
      });
    }

    if (certificateAuthority.externalCa?.id && certificateAuthority.externalCa.type !== type) {
      throw new BadRequestError({
        message: "External certificate authority cannot be deleted"
      });
    }

    await certificateAuthorityDAL.deleteById(certificateAuthority.id);

    if (type === CaType.INTERNAL) {
      return {
        id: certificateAuthority.id,
        type,
        enableDirectIssuance: certificateAuthority.enableDirectIssuance,
        name: certificateAuthority.name,
        projectId: certificateAuthority.projectId,
        configuration: certificateAuthority.internalCa,
        status: certificateAuthority.status
      } as TCertificateAuthority;
    }

    if (type === CaType.ACME) {
      return castDbEntryToAcmeCertificateAuthority(certificateAuthority);
    }

    throw new BadRequestError({ message: "Invalid certificate authority type" });
  };

  return {
    createCertificateAuthority,
    findCertificateAuthorityByNameAndProjectId,
    listCertificateAuthoritiesByProjectId,
    updateCertificateAuthority,
    deleteCertificateAuthority
  };
};
