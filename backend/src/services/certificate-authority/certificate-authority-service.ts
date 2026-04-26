import { ForbiddenError, subject } from "@casl/ability";

import { ActionProjectType, TableName } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionCertificateActions,
  ProjectPermissionCertificateAuthorityActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { getProcessedPermissionRules } from "@app/lib/casl/permission-filter-utils";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { OrgServiceActor, TProjectPermission } from "@app/lib/types";

import { TAppConnectionDALFactory } from "../app-connection/app-connection-dal";
import { TAppConnectionServiceFactory } from "../app-connection/app-connection-service";
import { TCertificateBodyDALFactory } from "../certificate/certificate-body-dal";
import { TCertificateDALFactory } from "../certificate/certificate-dal";
import { TCertificateSecretDALFactory } from "../certificate/certificate-secret-dal";
import { CrlReason } from "../certificate/certificate-types";
import { TCertificateProfileDALFactory } from "../certificate-profile/certificate-profile-dal";
import { TCertificateRequestDALFactory } from "../certificate-request/certificate-request-dal";
import { CertificateRequestStatus } from "../certificate-request/certificate-request-types";
import { TKmsServiceFactory } from "../kms/kms-service";
import { TPkiSubscriberDALFactory } from "../pki-subscriber/pki-subscriber-dal";
import { TPkiSyncDALFactory } from "../pki-sync/pki-sync-dal";
import { TPkiSyncQueueFactory } from "../pki-sync/pki-sync-queue";
import { TProjectDALFactory } from "../project/project-dal";
import { TResourceMetadataDALFactory } from "../resource-metadata/resource-metadata-dal";
import {
  AcmeCertificateAuthorityFns,
  castDbEntryToAcmeCertificateAuthority
} from "./acme/acme-certificate-authority-fns";
import {
  TCreateAcmeCertificateAuthorityDTO,
  TUpdateAcmeCertificateAuthorityDTO
} from "./acme/acme-certificate-authority-types";
import {
  AwsAcmPublicCaCertificateAuthorityFns,
  castDbEntryToAwsAcmPublicCaCertificateAuthority
} from "./aws-acm-public-ca/aws-acm-public-ca-certificate-authority-fns";
import {
  TCreateAwsAcmPublicCaCertificateAuthorityDTO,
  TUpdateAwsAcmPublicCaCertificateAuthorityDTO
} from "./aws-acm-public-ca/aws-acm-public-ca-certificate-authority-types";
import {
  AwsPcaCertificateAuthorityFns,
  castDbEntryToAwsPcaCertificateAuthority
} from "./aws-pca/aws-pca-certificate-authority-fns";
import {
  TCreateAwsPcaCertificateAuthorityDTO,
  TUpdateAwsPcaCertificateAuthorityDTO
} from "./aws-pca/aws-pca-certificate-authority-types";
import {
  AzureAdCsCertificateAuthorityFns,
  castDbEntryToAzureAdCsCertificateAuthority
} from "./azure-ad-cs/azure-ad-cs-certificate-authority-fns";
import {
  TCreateAzureAdCsCertificateAuthorityDTO,
  TUpdateAzureAdCsCertificateAuthorityDTO
} from "./azure-ad-cs/azure-ad-cs-certificate-authority-types";
import { TCertificateAuthorityDALFactory } from "./certificate-authority-dal";
import { CaType } from "./certificate-authority-enums";
import {
  TCertificateAuthority,
  TCreateCertificateAuthorityDTO,
  TDeprecatedUpdateCertificateAuthorityDTO,
  TUpdateCertificateAuthorityDTO
} from "./certificate-authority-types";
import {
  castDbEntryToDigiCertCertificateAuthority,
  DigiCertCertificateAuthorityFns
} from "./digicert/digicert-certificate-authority-fns";
import { processDigiCertPendingValidationRequest } from "./digicert/digicert-certificate-authority-processor";
import {
  TCreateDigiCertCertificateAuthorityDTO,
  TUpdateDigiCertCertificateAuthorityDTO
} from "./digicert/digicert-certificate-authority-types";
import { TExternalCertificateAuthorityDALFactory } from "./external-certificate-authority-dal";
import { TInternalCertificateAuthorityServiceFactory } from "./internal/internal-certificate-authority-service";
import { TCreateInternalCertificateAuthorityDTO } from "./internal/internal-certificate-authority-types";

type TCertificateAuthorityServiceFactoryDep = {
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById" | "update" | "updateById">;
  appConnectionService: Pick<TAppConnectionServiceFactory, "validateAppConnectionUsageById">;
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
  certificateDAL: Pick<TCertificateDALFactory, "create" | "findById" | "findOne" | "transaction" | "updateById">;
  certificateBodyDAL: Pick<TCertificateBodyDALFactory, "create">;
  certificateSecretDAL: Pick<TCertificateSecretDALFactory, "create">;
  kmsService: Pick<
    TKmsServiceFactory,
    "encryptWithKmsKey" | "generateKmsKey" | "createCipherPairWithDataKey" | "decryptWithKmsKey"
  >;
  pkiSubscriberDAL: Pick<TPkiSubscriberDALFactory, "findById">;
  pkiSyncDAL: Pick<TPkiSyncDALFactory, "find">;
  pkiSyncQueue: Pick<TPkiSyncQueueFactory, "queuePkiSyncSyncCertificatesById">;
  certificateProfileDAL?: Pick<TCertificateProfileDALFactory, "findById" | "findByIdWithConfigs">;
  certificateRequestDAL: Pick<
    TCertificateRequestDALFactory,
    "findById" | "updateById" | "updateStatus" | "attachCertificate"
  >;
  resourceMetadataDAL: Pick<TResourceMetadataDALFactory, "find" | "insertMany">;
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
  pkiSubscriberDAL,
  pkiSyncDAL,
  pkiSyncQueue,
  certificateProfileDAL,
  certificateRequestDAL,
  resourceMetadataDAL
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
    projectDAL,
    pkiSyncDAL,
    pkiSyncQueue,
    certificateProfileDAL
  });

  const azureAdCsFns = AzureAdCsCertificateAuthorityFns({
    appConnectionDAL,
    appConnectionService,
    certificateAuthorityDAL,
    externalCertificateAuthorityDAL,
    certificateDAL,
    certificateBodyDAL,
    certificateSecretDAL,
    kmsService,
    pkiSubscriberDAL,
    projectDAL,
    pkiSyncDAL,
    pkiSyncQueue,
    certificateProfileDAL
  });

  const awsPcaFns = AwsPcaCertificateAuthorityFns({
    appConnectionDAL,
    appConnectionService,
    certificateAuthorityDAL,
    externalCertificateAuthorityDAL,
    certificateDAL,
    certificateBodyDAL,
    certificateSecretDAL,
    kmsService,
    projectDAL,
    certificateProfileDAL
  });

  const digicertFns = DigiCertCertificateAuthorityFns({
    appConnectionDAL,
    appConnectionService,
    certificateAuthorityDAL,
    externalCertificateAuthorityDAL,
    certificateDAL,
    certificateBodyDAL,
    certificateSecretDAL,
    kmsService,
    projectDAL
  });
  const awsAcmPublicCaFns = AwsAcmPublicCaCertificateAuthorityFns({
    appConnectionDAL,
    appConnectionService,
    certificateAuthorityDAL,
    externalCertificateAuthorityDAL,
    certificateDAL,
    certificateBodyDAL,
    certificateSecretDAL,
    kmsService,
    projectDAL,
    certificateProfileDAL
  });

  const createCertificateAuthority = async (
    { type, projectId, name, configuration, status }: TCreateCertificateAuthorityDTO,
    actor: OrgServiceActor
  ) => {
    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCertificateAuthorityActions.Create,
      subject(ProjectPermissionSub.CertificateAuthorities, { name })
    );

    if (type === CaType.INTERNAL) {
      const ca = await internalCertificateAuthorityService.createCa({
        ...(configuration as TCreateInternalCertificateAuthorityDTO["configuration"]),
        isInternal: true,
        projectId,
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
        status,
        actor
      });
    }

    if (type === CaType.AZURE_AD_CS) {
      return azureAdCsFns.createCertificateAuthority({
        name,
        projectId,
        configuration: configuration as TCreateAzureAdCsCertificateAuthorityDTO["configuration"],
        status,
        actor
      });
    }

    if (type === CaType.AWS_PCA) {
      return awsPcaFns.createCertificateAuthority({
        name,
        projectId,
        configuration: configuration as TCreateAwsPcaCertificateAuthorityDTO["configuration"],
        status,
        actor
      });
    }

    if (type === CaType.DIGICERT) {
      return digicertFns.createCertificateAuthority({
        name,
        projectId,
        configuration: configuration as TCreateDigiCertCertificateAuthorityDTO["configuration"],
        status,
        actor
      });
    }
    if (type === CaType.AWS_ACM_PUBLIC_CA) {
      return awsAcmPublicCaFns.createCertificateAuthority({
        name,
        projectId,
        configuration: configuration as TCreateAwsAcmPublicCaCertificateAuthorityDTO["configuration"],
        status,
        actor
      });
    }

    throw new BadRequestError({ message: "Invalid certificate authority type" });
  };

  const findCertificateAuthorityById = async ({ id, type }: { id: string; type: CaType }, actor: OrgServiceActor) => {
    const certificateAuthority = await certificateAuthorityDAL.findByIdWithAssociatedCa(id);

    if (!certificateAuthority)
      throw new NotFoundError({
        message: `Could not find certificate authority with id "${id}"`
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
      ProjectPermissionCertificateAuthorityActions.Read,
      subject(ProjectPermissionSub.CertificateAuthorities, { name: certificateAuthority.name })
    );

    if (type === CaType.INTERNAL) {
      if (!certificateAuthority.internalCa?.id) {
        throw new NotFoundError({
          message: `Internal certificate authority with id "${id}" not found`
        });
      }

      return {
        id: certificateAuthority.id,
        type,
        enableDirectIssuance: certificateAuthority.enableDirectIssuance,
        subject: ProjectPermissionSub.CertificateAuthorities,
        name: certificateAuthority.name,
        projectId: certificateAuthority.projectId,
        configuration: certificateAuthority.internalCa,
        status: certificateAuthority.status
      } as TCertificateAuthority;
    }

    if (certificateAuthority.externalCa?.type !== type) {
      throw new NotFoundError({
        message: `Could not find external certificate authority with id ${id} and type "${type}"`
      });
    }

    if (type === CaType.ACME) {
      return castDbEntryToAcmeCertificateAuthority(certificateAuthority);
    }

    if (type === CaType.AZURE_AD_CS) {
      return castDbEntryToAzureAdCsCertificateAuthority(certificateAuthority);
    }

    if (type === CaType.AWS_PCA) {
      return castDbEntryToAwsPcaCertificateAuthority(certificateAuthority);
    }

    if (type === CaType.DIGICERT) {
      return castDbEntryToDigiCertCertificateAuthority(certificateAuthority);
    }

    if (type === CaType.AWS_ACM_PUBLIC_CA) {
      return castDbEntryToAwsAcmPublicCaCertificateAuthority(certificateAuthority);
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
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCertificateAuthorityActions.Read,
      subject(ProjectPermissionSub.CertificateAuthorities, { name: caName })
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

    if (type === CaType.AZURE_AD_CS) {
      return castDbEntryToAzureAdCsCertificateAuthority(certificateAuthority);
    }

    if (type === CaType.AWS_PCA) {
      return castDbEntryToAwsPcaCertificateAuthority(certificateAuthority);
    }

    if (type === CaType.DIGICERT) {
      return castDbEntryToDigiCertCertificateAuthority(certificateAuthority);
    }
    if (type === CaType.AWS_ACM_PUBLIC_CA) {
      return castDbEntryToAwsAcmPublicCaCertificateAuthority(certificateAuthority);
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
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCertificateAuthorityActions.Read,
      ProjectPermissionSub.CertificateAuthorities
    );

    const permissionFilters = getProcessedPermissionRules(
      permission,
      ProjectPermissionCertificateAuthorityActions.Read,
      ProjectPermissionSub.CertificateAuthorities
    );

    if (type === CaType.INTERNAL) {
      const cas = await certificateAuthorityDAL.findWithAssociatedCa(
        {
          [`${TableName.CertificateAuthority}.projectId` as "projectId"]: projectId,
          $notNull: [`${TableName.InternalCertificateAuthority}.id` as "id"]
        },
        {},
        permissionFilters
      );

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
      return acmeFns.listCertificateAuthorities({ projectId, permissionFilters });
    }

    if (type === CaType.AZURE_AD_CS) {
      return azureAdCsFns.listCertificateAuthorities({ projectId, permissionFilters });
    }

    if (type === CaType.AWS_PCA) {
      return awsPcaFns.listCertificateAuthorities({ projectId, permissionFilters });
    }

    if (type === CaType.DIGICERT) {
      return digicertFns.listCertificateAuthorities({ projectId, permissionFilters });
    }

    if (type === CaType.AWS_ACM_PUBLIC_CA) {
      return awsAcmPublicCaFns.listCertificateAuthorities({ projectId, permissionFilters });
    }

    throw new BadRequestError({ message: "Invalid certificate authority type" });
  };

  const updateCertificateAuthority = async (
    { id, type, configuration, status, name }: TUpdateCertificateAuthorityDTO,
    actor: OrgServiceActor
  ) => {
    const certificateAuthority = await certificateAuthorityDAL.findByIdWithAssociatedCa(id);

    if (!certificateAuthority)
      throw new NotFoundError({
        message: `Could not find certificate authority with id "${id}"`
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
      ProjectPermissionCertificateAuthorityActions.Edit,
      subject(ProjectPermissionSub.CertificateAuthorities, { name: certificateAuthority.name })
    );

    if (type === CaType.INTERNAL) {
      if (!certificateAuthority.internalCa?.id) {
        throw new NotFoundError({
          message: `Internal certificate authority with id "${id}" not found`
        });
      }

      const updatedCa = await internalCertificateAuthorityService.updateCaById({
        isInternal: true,
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
        actor,
        status,
        name
      });
    }

    if (type === CaType.AZURE_AD_CS) {
      return azureAdCsFns.updateCertificateAuthority({
        id: certificateAuthority.id,
        configuration: configuration as TUpdateAzureAdCsCertificateAuthorityDTO["configuration"],
        actor,
        status,
        name
      });
    }

    if (type === CaType.AWS_PCA) {
      return awsPcaFns.updateCertificateAuthority({
        id: certificateAuthority.id,
        configuration: configuration as TUpdateAwsPcaCertificateAuthorityDTO["configuration"],
        actor,
        status,
        name
      });
    }

    if (type === CaType.DIGICERT) {
      return digicertFns.updateCertificateAuthority({
        id: certificateAuthority.id,
        configuration: configuration as TUpdateDigiCertCertificateAuthorityDTO["configuration"],
        actor,
        status,
        name
      });
    }

    if (type === CaType.AWS_ACM_PUBLIC_CA) {
      return awsAcmPublicCaFns.updateCertificateAuthority({
        id: certificateAuthority.id,
        configuration: configuration as TUpdateAwsAcmPublicCaCertificateAuthorityDTO["configuration"],
        actor,
        status,
        name
      });
    }

    throw new BadRequestError({ message: "Invalid certificate authority type" });
  };

  const deleteCertificateAuthority = async ({ id, type }: { id: string; type: CaType }, actor: OrgServiceActor) => {
    const certificateAuthority = await certificateAuthorityDAL.findByIdWithAssociatedCa(id);

    if (!certificateAuthority)
      throw new NotFoundError({
        message: `Could not find certificate authority with id "${id}"`
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
      ProjectPermissionCertificateAuthorityActions.Delete,
      subject(ProjectPermissionSub.CertificateAuthorities, { name: certificateAuthority.name })
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

    if (type === CaType.AZURE_AD_CS) {
      return castDbEntryToAzureAdCsCertificateAuthority(certificateAuthority);
    }

    if (type === CaType.AWS_PCA) {
      return castDbEntryToAwsPcaCertificateAuthority(certificateAuthority);
    }

    if (type === CaType.DIGICERT) {
      return castDbEntryToDigiCertCertificateAuthority(certificateAuthority);
    }

    if (type === CaType.AWS_ACM_PUBLIC_CA) {
      return castDbEntryToAwsAcmPublicCaCertificateAuthority(certificateAuthority);
    }

    throw new BadRequestError({ message: "Invalid certificate authority type" });
  };

  const deprecatedUpdateCertificateAuthority = async (
    { caName, type, configuration, status, name, projectId }: TDeprecatedUpdateCertificateAuthorityDTO,
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
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCertificateAuthorityActions.Edit,
      subject(ProjectPermissionSub.CertificateAuthorities, { name: certificateAuthority.name })
    );

    if (type === CaType.INTERNAL) {
      if (!certificateAuthority.internalCa?.id) {
        throw new NotFoundError({
          message: `Internal certificate authority with name "${caName}" in project "${projectId}" not found`
        });
      }

      const updatedCa = await internalCertificateAuthorityService.updateCaById({
        isInternal: true,
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
        actor,
        status,
        name
      });
    }

    if (type === CaType.AZURE_AD_CS) {
      return azureAdCsFns.updateCertificateAuthority({
        id: certificateAuthority.id,
        configuration: configuration as TUpdateAzureAdCsCertificateAuthorityDTO["configuration"],
        actor,
        status,
        name
      });
    }

    if (type === CaType.AWS_PCA) {
      return awsPcaFns.updateCertificateAuthority({
        id: certificateAuthority.id,
        configuration: configuration as TUpdateAwsPcaCertificateAuthorityDTO["configuration"],
        actor,
        status,
        name
      });
    }

    if (type === CaType.DIGICERT) {
      return digicertFns.updateCertificateAuthority({
        id: certificateAuthority.id,
        configuration: configuration as TUpdateDigiCertCertificateAuthorityDTO["configuration"],
        actor,
        status,
        name
      });
    }

    if (type === CaType.AWS_ACM_PUBLIC_CA) {
      return awsAcmPublicCaFns.updateCertificateAuthority({
        id: certificateAuthority.id,
        configuration: configuration as TUpdateAwsAcmPublicCaCertificateAuthorityDTO["configuration"],
        actor,
        status,
        name
      });
    }

    throw new BadRequestError({ message: "Invalid certificate authority type" });
  };

  const deprecatedDeleteCertificateAuthority = async (
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
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCertificateAuthorityActions.Delete,
      subject(ProjectPermissionSub.CertificateAuthorities, { name: certificateAuthority.name })
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

    if (type === CaType.AZURE_AD_CS) {
      return castDbEntryToAzureAdCsCertificateAuthority(certificateAuthority);
    }

    if (type === CaType.AWS_PCA) {
      return castDbEntryToAwsPcaCertificateAuthority(certificateAuthority);
    }

    if (type === CaType.DIGICERT) {
      return castDbEntryToDigiCertCertificateAuthority(certificateAuthority);
    }

    if (type === CaType.AWS_ACM_PUBLIC_CA) {
      return castDbEntryToAwsAcmPublicCaCertificateAuthority(certificateAuthority);
    }

    throw new BadRequestError({ message: "Invalid certificate authority type" });
  };

  const getAzureAdcsTemplates = async ({
    caId,
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: {
    caId: string;
    projectId: string;
    actor: OrgServiceActor["type"];
    actorId: string;
    actorAuthMethod: OrgServiceActor["authMethod"];
    actorOrgId?: string;
  }) => {
    const certificateAuthority = await certificateAuthorityDAL.findByIdWithAssociatedCa(caId);

    if (!certificateAuthority)
      throw new NotFoundError({
        message: `Could not find certificate authority with id "${caId}"`
      });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCertificateAuthorityActions.Read,
      subject(ProjectPermissionSub.CertificateAuthorities, {
        name: certificateAuthority.name
      })
    );

    return azureAdCsFns.getTemplates({
      caId,
      projectId
    });
  };

  const getCaById = async ({
    caId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    isInternal
  }: {
    caId: string;
    actor: OrgServiceActor["type"];
    actorId: string;
    actorAuthMethod: OrgServiceActor["authMethod"];
    actorOrgId?: string;
    isInternal?: boolean;
  }) => {
    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(caId);
    if (!ca) {
      throw new NotFoundError({ message: "CA not found" });
    }

    if (!isInternal) {
      const { permission } = await permissionService.getProjectPermission({
        actor,
        actorId,
        projectId: ca.projectId,
        actorAuthMethod,
        actorOrgId,
        actionProjectType: ActionProjectType.CertificateManager
      });

      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionCertificateAuthorityActions.Read,
        subject(ProjectPermissionSub.CertificateAuthorities, {
          name: ca.name
        })
      );
    }

    return ca;
  };

  const revokeCertificate = async ({
    caId,
    serialNumber,
    reason
  }: {
    caId: string;
    serialNumber: string;
    reason: CrlReason;
  }) => {
    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(caId);
    if (!ca) {
      throw new NotFoundError({ message: `Could not find certificate authority with id "${caId}"` });
    }

    const caType = (ca.externalCa?.type as CaType) ?? CaType.INTERNAL;

    if (caType === CaType.AWS_PCA) {
      await awsPcaFns.revokeCertificate({ caId, serialNumber, reason });
      return;
    }

    if (caType === CaType.DIGICERT) {
      await digicertFns.revokeCertificate({ caId, serialNumber, reason });
      return;
    }

    if (caType === CaType.AWS_ACM_PUBLIC_CA) {
      await awsAcmPublicCaFns.revokeCertificate({ caId, serialNumber, reason });
      return;
    }

    throw new BadRequestError({
      message: `Certificate revocation via CA service is not supported for CA type "${caType}"`
    });
  };

  const triggerCertificateRequestValidation = async ({
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    certificateRequestId
  }: Omit<TProjectPermission, "projectId"> & { certificateRequestId: string }) => {
    const certificateRequest = await certificateRequestDAL.findById(certificateRequestId);
    if (!certificateRequest) {
      throw new NotFoundError({ message: "Certificate request not found" });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: certificateRequest.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    const requestMetadata = (await resourceMetadataDAL.find({ certificateRequestId: certificateRequest.id })).map(
      ({ key, value }) => ({ key, value: value || "" })
    );

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCertificateActions.Edit,
      subject(ProjectPermissionSub.Certificates, {
        commonName: certificateRequest.commonName ?? undefined,
        altNames: Array.isArray(certificateRequest.altNames)
          ? (certificateRequest.altNames as { type: string; value: string }[]).map((san) => san.value)
          : undefined,
        metadata: requestMetadata
      })
    );

    if (certificateRequest.status !== CertificateRequestStatus.PENDING_VALIDATION) {
      throw new BadRequestError({
        message: `Certificate request is not pending validation [status=${certificateRequest.status}]`
      });
    }

    if (!certificateRequest.caId) {
      throw new BadRequestError({ message: "Certificate request is not linked to a certificate authority" });
    }

    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(certificateRequest.caId);
    if (ca.externalCa?.type !== CaType.DIGICERT) {
      throw new BadRequestError({
        message: `Manual validation is only supported for DigiCert certificate authorities [caType=${ca.externalCa?.type}]`
      });
    }

    const result = await processDigiCertPendingValidationRequest(
      {
        certificateAuthorityDAL,
        appConnectionDAL,
        kmsService,
        certificateRequestDAL,
        certificateRequestService: {
          updateCertificateRequestStatus: async ({ certificateRequestId: id, status, errorMessage }) =>
            certificateRequestDAL.updateStatus(id, status, errorMessage),
          attachCertificateToRequest: async ({ certificateRequestId: id, certificateId }) =>
            certificateRequestDAL.attachCertificate(id, certificateId)
        },
        resourceMetadataDAL,
        digicertFns
      },
      certificateRequest
    );

    return { ...result, projectId: certificateRequest.projectId };
  };

  return {
    createCertificateAuthority,
    findCertificateAuthorityById,
    listCertificateAuthoritiesByProjectId,
    findCertificateAuthorityByNameAndProjectId,
    updateCertificateAuthority,
    deleteCertificateAuthority,
    getAzureAdcsTemplates,
    getCaById,
    deprecatedUpdateCertificateAuthority,
    deprecatedDeleteCertificateAuthority,
    revokeCertificate,
    triggerCertificateRequestValidation
  };
};
