import { ForbiddenError } from "@casl/ability";

import { ActionProjectType, TPamResources } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { DatabaseErrorCode } from "@app/lib/error-codes";
import { BadRequestError, DatabaseError, NotFoundError } from "@app/lib/errors";
import { OrgServiceActor } from "@app/lib/types";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

import { TGatewayV2ServiceFactory } from "../gateway-v2/gateway-v2-service";
import { TLicenseServiceFactory } from "../license/license-service";
import { decryptAccountCredentials, encryptAccountCredentials } from "../pam-account/pam-account-fns";
import { TPamResourceDALFactory } from "./pam-resource-dal";
import { PamResource } from "./pam-resource-enums";
import { PAM_RESOURCE_FACTORY_MAP } from "./pam-resource-factory";
import {
  decryptResource,
  decryptResourceConnectionDetails,
  encryptResourceConnectionDetails,
  listResourceOptions
} from "./pam-resource-fns";
import { TCreateResourceDTO, TListResourcesDTO, TUpdateResourceDTO } from "./pam-resource-types";

type TPamResourceServiceFactoryDep = {
  pamResourceDAL: TPamResourceDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getOrgPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
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
  licenseService,
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
    const orgLicensePlan = await licenseService.getPlan(actor.orgId);
    if (!orgLicensePlan.pam) {
      throw new BadRequestError({
        message: "PAM operation failed due to organization plan restrictions."
      });
    }

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
    const orgLicensePlan = await licenseService.getPlan(actor.orgId);
    if (!orgLicensePlan.pam) {
      throw new BadRequestError({
        message: "PAM operation failed due to organization plan restrictions."
      });
    }

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

  return {
    getById,
    create,
    updateById,
    deleteById,
    list,
    listResourceOptions
  };
};
