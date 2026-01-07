import { ForbiddenError } from "@casl/ability";

import { ActionProjectType, TPamResources } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { createSshKeyPair } from "@app/ee/services/ssh/ssh-certificate-authority-fns";
import { SshCertKeyAlgorithm } from "@app/ee/services/ssh-certificate/ssh-certificate-types";
import { PgSqlLock } from "@app/keystore/keystore";
import { DatabaseErrorCode } from "@app/lib/error-codes";
import { BadRequestError, DatabaseError, NotFoundError } from "@app/lib/errors";
import { OrgServiceActor } from "@app/lib/types";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

import { TGatewayV2ServiceFactory } from "../gateway-v2/gateway-v2-service";
import { decryptAccountCredentials, encryptAccountCredentials } from "../pam-account/pam-account-fns";
import { TPamResourceDALFactory } from "./pam-resource-dal";
import { PamResource } from "./pam-resource-enums";
import { PAM_RESOURCE_FACTORY_MAP } from "./pam-resource-factory";
import {
  decryptResource,
  decryptResourceConnectionDetails,
  decryptResourceMetadata,
  encryptResourceConnectionDetails,
  encryptResourceMetadata,
  listResourceOptions
} from "./pam-resource-fns";
import { TCreateResourceDTO, TListResourcesDTO, TUpdateResourceDTO } from "./pam-resource-types";
import { TSSHResourceMetadata } from "./ssh/ssh-resource-types";

type TPamResourceServiceFactoryDep = {
  pamResourceDAL: TPamResourceDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getOrgPermission">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  gatewayV2Service: Pick<
    TGatewayV2ServiceFactory,
    "getPAMConnectionDetails" | "getPlatformConnectionDetailsByGatewayId"
  >;
};

export type TPamResourceServiceFactory = ReturnType<typeof pamResourceServiceFactory>;

export const pamResourceServiceFactory = ({
  pamResourceDAL,
  permissionService,
  kmsService,
  gatewayV2Service
}: TPamResourceServiceFactoryDep) => {
  const getById = async (id: string, resourceType: PamResource, actor: OrgServiceActor) => {
    const resource = await pamResourceDAL.findById(id);
    if (!resource) throw new NotFoundError({ message: `Resource with ID '${id}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorAuthMethod: actor.authMethod,
      actorId: actor.id,
      actorOrgId: actor.orgId,
      projectId: resource.projectId,
      actionProjectType: ActionProjectType.PAM
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.PamResources);

    if (resource.resourceType !== resourceType) {
      throw new BadRequestError({
        message: `Resource with ID '${id}' is not of type '${resourceType}'`
      });
    }

    return decryptResource(resource, resource.projectId, kmsService);
  };

  const create = async (
    { resourceType, connectionDetails, gatewayId, name, projectId, rotationAccountCredentials }: TCreateResourceDTO,
    actor: OrgServiceActor
  ) => {
    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorAuthMethod: actor.authMethod,
      actorId: actor.id,
      actorOrgId: actor.orgId,
      projectId,
      actionProjectType: ActionProjectType.PAM
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Create, ProjectPermissionSub.PamResources);

    const factory = PAM_RESOURCE_FACTORY_MAP[resourceType](
      resourceType,
      connectionDetails,
      gatewayId,
      gatewayV2Service,
      projectId
    );

    const validatedConnectionDetails = await factory.validateConnection();
    const encryptedConnectionDetails = await encryptResourceConnectionDetails({
      connectionDetails: validatedConnectionDetails,
      projectId,
      kmsService
    });

    let encryptedRotationAccountCredentials: Buffer | null = null;

    if (rotationAccountCredentials) {
      const validatedRotationAccountCredentials = await factory.validateAccountCredentials(rotationAccountCredentials);

      encryptedRotationAccountCredentials = await encryptAccountCredentials({
        credentials: validatedRotationAccountCredentials,
        projectId,
        kmsService
      });
    }

    const resource = await pamResourceDAL.create({
      resourceType,
      encryptedConnectionDetails,
      gatewayId,
      name,
      projectId,
      encryptedRotationAccountCredentials
    });

    return decryptResource(resource, projectId, kmsService);
  };

  const updateById = async (
    { connectionDetails, resourceId, name, rotationAccountCredentials }: TUpdateResourceDTO,
    actor: OrgServiceActor
  ) => {
    const resource = await pamResourceDAL.findById(resourceId);
    if (!resource) throw new NotFoundError({ message: `Resource with ID '${resourceId}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorAuthMethod: actor.authMethod,
      actorId: actor.id,
      actorOrgId: actor.orgId,
      projectId: resource.projectId,
      actionProjectType: ActionProjectType.PAM
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.PamResources);

    const updateDoc: Partial<TPamResources> = {};

    if (name !== undefined) {
      updateDoc.name = name;
    }

    if (connectionDetails !== undefined) {
      const factory = PAM_RESOURCE_FACTORY_MAP[resource.resourceType as PamResource](
        resource.resourceType as PamResource,
        connectionDetails,
        resource.gatewayId,
        gatewayV2Service,
        resource.projectId
      );
      const validatedConnectionDetails = await factory.validateConnection();
      const encryptedConnectionDetails = await encryptResourceConnectionDetails({
        connectionDetails: validatedConnectionDetails,
        projectId: resource.projectId,
        kmsService
      });
      updateDoc.encryptedConnectionDetails = encryptedConnectionDetails;
    }

    if (rotationAccountCredentials !== undefined) {
      updateDoc.encryptedRotationAccountCredentials = null;

      if (rotationAccountCredentials) {
        const decryptedConnectionDetails =
          connectionDetails ??
          (await decryptResourceConnectionDetails({
            encryptedConnectionDetails: resource.encryptedConnectionDetails,
            projectId: resource.projectId,
            kmsService
          }));

        const factory = PAM_RESOURCE_FACTORY_MAP[resource.resourceType as PamResource](
          resource.resourceType as PamResource,
          decryptedConnectionDetails,
          resource.gatewayId,
          gatewayV2Service,
          resource.projectId
        );

        let finalCredentials = { ...rotationAccountCredentials };
        if (resource.encryptedRotationAccountCredentials) {
          const decryptedCredentials = await decryptAccountCredentials({
            encryptedCredentials: resource.encryptedRotationAccountCredentials,
            projectId: resource.projectId,
            kmsService
          });

          finalCredentials = await factory.handleOverwritePreventionForCensoredValues(
            rotationAccountCredentials,
            decryptedCredentials
          );
        }

        try {
          const validatedRotationAccountCredentials = await factory.validateAccountCredentials(finalCredentials);

          updateDoc.encryptedRotationAccountCredentials = await encryptAccountCredentials({
            credentials: validatedRotationAccountCredentials,
            projectId: resource.projectId,
            kmsService
          });
        } catch (err) {
          if (err instanceof BadRequestError) {
            throw new BadRequestError({
              message: `Rotation Account Error: ${err.message}`
            });
          }

          throw err;
        }
      }
    }

    // If nothing was updated, return the fetched resource
    if (Object.keys(updateDoc).length === 0) {
      return decryptResource(resource, resource.projectId, kmsService);
    }

    const updatedResource = await pamResourceDAL.updateById(resourceId, updateDoc);

    return decryptResource(updatedResource, resource.projectId, kmsService);
  };

  const deleteById = async (id: string, actor: OrgServiceActor) => {
    const resource = await pamResourceDAL.findById(id);
    if (!resource) throw new NotFoundError({ message: `Resource with ID '${id}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorAuthMethod: actor.authMethod,
      actorId: actor.id,
      actorOrgId: actor.orgId,
      projectId: resource.projectId,
      actionProjectType: ActionProjectType.PAM
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Delete, ProjectPermissionSub.PamResources);

    try {
      const deletedResource = await pamResourceDAL.deleteById(id);
      return await decryptResource(deletedResource, resource.projectId, kmsService);
    } catch (err) {
      if (
        err instanceof DatabaseError &&
        (err.error as { code: string })?.code === DatabaseErrorCode.ForeignKeyViolation
      ) {
        throw new BadRequestError({
          message: "Failed to delete resource because it is attached to active PAM accounts"
        });
      }
      throw err;
    }
  };

  const list = async ({ projectId, actor, actorId, actorAuthMethod, actorOrgId, ...params }: TListResourcesDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId,
      projectId,
      actionProjectType: ActionProjectType.PAM
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.PamResources);

    const { resources, totalCount } = await pamResourceDAL.findByProjectId({ projectId, ...params });

    return {
      resources: await Promise.all(resources.map((resource) => decryptResource(resource, projectId, kmsService))),
      totalCount
    };
  };

  const getOrCreateSshCa = async (resourceId: string, actor: OrgServiceActor) => {
    const resource = await pamResourceDAL.findById(resourceId);
    if (!resource) throw new NotFoundError({ message: `Resource with ID '${resourceId}' not found` });

    if (resource.resourceType !== PamResource.SSH) {
      throw new BadRequestError({ message: "This operation is only available for SSH resources" });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorAuthMethod: actor.authMethod,
      actorId: actor.id,
      actorOrgId: actor.orgId,
      projectId: resource.projectId,
      actionProjectType: ActionProjectType.PAM
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.PamResources);

    // Check if metadata already exists with CA
    if (resource.encryptedResourceMetadata) {
      const metadata = await decryptResourceMetadata<TSSHResourceMetadata>({
        encryptedMetadata: resource.encryptedResourceMetadata,
        projectId: resource.projectId,
        kmsService
      });
      return { caPublicKey: metadata.caPublicKey };
    }

    // Transaction with advisory lock to prevent race conditions
    const caPublicKey = await pamResourceDAL.transaction(async (tx) => {
      await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.PamResourceSshCaInit(resourceId)]);

      // Re-check after acquiring lock in case another transaction created it
      const currentResource = await pamResourceDAL.findById(resourceId, tx);
      if (currentResource?.encryptedResourceMetadata) {
        const metadata = await decryptResourceMetadata<TSSHResourceMetadata>({
          encryptedMetadata: currentResource.encryptedResourceMetadata,
          projectId: currentResource.projectId,
          kmsService
        });
        return metadata.caPublicKey;
      }

      // Generate new CA key pair
      const keyAlgorithm = SshCertKeyAlgorithm.ED25519;
      const { publicKey, privateKey } = await createSshKeyPair(keyAlgorithm);

      const metadata: TSSHResourceMetadata = {
        caPrivateKey: privateKey,
        caPublicKey: publicKey.trim(),
        caKeyAlgorithm: keyAlgorithm
      };

      const encryptedResourceMetadata = await encryptResourceMetadata({
        metadata,
        projectId: resource.projectId,
        kmsService
      });

      await pamResourceDAL.updateById(resourceId, { encryptedResourceMetadata }, tx);

      return metadata.caPublicKey;
    });

    return { caPublicKey };
  };

  return {
    getById,
    create,
    updateById,
    deleteById,
    list,
    listResourceOptions,
    getOrCreateSshCa
  };
};
