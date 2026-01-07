import { ForbiddenError } from "@casl/ability";

import { OrganizationActionScope } from "@app/db/schemas";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { KmipOperationType, recordKmipOperationMetric } from "@app/lib/telemetry/metrics";
import { TKmsKeyDALFactory } from "@app/services/kms/kms-key-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsKeyUsage } from "@app/services/kms/kms-types";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import { OrgPermissionKmipActions, OrgPermissionSubjects } from "../permission/org-permission";
import { TPermissionServiceFactory } from "../permission/permission-service-types";
import { TKmipClientDALFactory } from "./kmip-client-dal";
import { KmipPermission } from "./kmip-enum";
import {
  TKmipCreateDTO,
  TKmipDestroyDTO,
  TKmipGetAttributesDTO,
  TKmipGetDTO,
  TKmipLocateDTO,
  TKmipRegisterDTO,
  TKmipRevokeDTO
} from "./kmip-types";

type TKmipOperationServiceFactoryDep = {
  kmsService: TKmsServiceFactory;
  kmsDAL: TKmsKeyDALFactory;
  kmipClientDAL: TKmipClientDALFactory;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
};

export type TKmipOperationServiceFactory = ReturnType<typeof kmipOperationServiceFactory>;

export const kmipOperationServiceFactory = ({
  kmsService,
  kmsDAL,
  projectDAL,
  kmipClientDAL,
  permissionService
}: TKmipOperationServiceFactoryDep) => {
  const create = async ({
    projectId,
    clientId,
    algorithm,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TKmipCreateDTO) => {
    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor,
      actorId,
      orgId: actorOrgId,
      actorAuthMethod,
      actorOrgId
    });

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionKmipActions.Proxy, OrgPermissionSubjects.Kmip);

    const kmipClient = await kmipClientDAL.findOne({
      id: clientId,
      projectId
    });

    if (!kmipClient.permissions?.includes(KmipPermission.Create)) {
      throw new ForbiddenRequestError({
        message: "Client does not have sufficient permission to perform KMIP create"
      });
    }

    const kmsKey = await kmsService.generateKmsKey({
      encryptionAlgorithm: algorithm,
      orgId: actorOrgId,
      projectId,
      isReserved: false
    });

    recordKmipOperationMetric({
      operationType: KmipOperationType.CREATE,
      orgId: actorOrgId,
      projectId,
      clientId,
      objectId: kmsKey.id,
      objectName: kmsKey.name
    });

    return kmsKey;
  };

  const destroy = async ({ projectId, id, clientId, actor, actorId, actorOrgId, actorAuthMethod }: TKmipDestroyDTO) => {
    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor,
      actorId,
      orgId: actorOrgId,
      actorAuthMethod,
      actorOrgId
    });

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionKmipActions.Proxy, OrgPermissionSubjects.Kmip);

    const kmipClient = await kmipClientDAL.findOne({
      id: clientId,
      projectId
    });

    if (!kmipClient.permissions?.includes(KmipPermission.Destroy)) {
      throw new ForbiddenRequestError({
        message: "Client does not have sufficient permission to perform KMIP destroy"
      });
    }

    const key = await kmsDAL.findOne({
      id,
      projectId
    });

    if (!key) {
      throw new NotFoundError({ message: `Key with ID ${id} not found` });
    }

    if (key.isReserved) {
      throw new BadRequestError({ message: "Cannot destroy reserved keys" });
    }

    const completeKeyDetails = await kmsDAL.findByIdWithAssociatedKms(id);
    if (!completeKeyDetails.internalKms) {
      throw new BadRequestError({
        message: "Cannot destroy external keys"
      });
    }

    if (!completeKeyDetails.isDisabled) {
      throw new BadRequestError({
        message: "Cannot destroy active keys"
      });
    }

    const kms = kmsDAL.deleteById(id);

    recordKmipOperationMetric({
      operationType: KmipOperationType.DESTROY,
      orgId: actorOrgId,
      projectId,
      clientId,
      objectId: id,
      objectName: key.name
    });

    return kms;
  };

  const get = async ({ projectId, id, clientId, actor, actorId, actorAuthMethod, actorOrgId }: TKmipGetDTO) => {
    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor,
      actorId,
      orgId: actorOrgId,
      actorAuthMethod,
      actorOrgId
    });

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionKmipActions.Proxy, OrgPermissionSubjects.Kmip);

    const kmipClient = await kmipClientDAL.findOne({
      id: clientId,
      projectId
    });

    if (!kmipClient.permissions?.includes(KmipPermission.Get)) {
      throw new ForbiddenRequestError({
        message: "Client does not have sufficient permission to perform KMIP get"
      });
    }

    const key = await kmsDAL.findOne({
      id,
      projectId
    });

    if (!key) {
      throw new NotFoundError({ message: `Key with ID ${id} not found` });
    }

    if (key.isReserved) {
      throw new BadRequestError({ message: "Cannot get reserved keys" });
    }

    const completeKeyDetails = await kmsDAL.findByIdWithAssociatedKms(id);

    if (!completeKeyDetails.internalKms) {
      throw new BadRequestError({
        message: "Cannot get external keys"
      });
    }

    const kmsKey = await kmsService.getKeyMaterial({
      kmsId: key.id
    });

    recordKmipOperationMetric({
      operationType: KmipOperationType.GET,
      orgId: actorOrgId,
      projectId,
      clientId,
      objectId: id,
      objectName: key.name
    });

    return {
      id: key.id,
      value: kmsKey.toString("base64"),
      algorithm: completeKeyDetails.internalKms.encryptionAlgorithm,
      isActive: !key.isDisabled,
      createdAt: key.createdAt,
      updatedAt: key.updatedAt,
      kmipMetadata: key.kmipMetadata as Record<string, unknown>
    };
  };

  const activate = async ({ projectId, id, clientId, actor, actorId, actorAuthMethod, actorOrgId }: TKmipGetDTO) => {
    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor,
      actorId,
      orgId: actorOrgId,
      actorAuthMethod,
      actorOrgId
    });

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionKmipActions.Proxy, OrgPermissionSubjects.Kmip);

    const kmipClient = await kmipClientDAL.findOne({
      id: clientId,
      projectId
    });

    if (!kmipClient.permissions?.includes(KmipPermission.Activate)) {
      throw new ForbiddenRequestError({
        message: "Client does not have sufficient permission to perform KMIP activate"
      });
    }

    const key = await kmsDAL.findOne({
      id,
      projectId
    });

    if (!key) {
      throw new NotFoundError({ message: `Key with ID ${id} not found` });
    }

    recordKmipOperationMetric({
      operationType: KmipOperationType.ACTIVATE,
      orgId: actorOrgId,
      projectId,
      clientId,
      objectId: id,
      objectName: key.name
    });

    return {
      id: key.id,
      isActive: !key.isDisabled
    };
  };

  const revoke = async ({ projectId, id, clientId, actor, actorId, actorAuthMethod, actorOrgId }: TKmipRevokeDTO) => {
    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor,
      actorId,
      orgId: actorOrgId,
      actorAuthMethod,
      actorOrgId
    });

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionKmipActions.Proxy, OrgPermissionSubjects.Kmip);

    const kmipClient = await kmipClientDAL.findOne({
      id: clientId,
      projectId
    });

    if (!kmipClient.permissions?.includes(KmipPermission.Revoke)) {
      throw new ForbiddenRequestError({
        message: "Client does not have sufficient permission to perform KMIP revoke"
      });
    }

    const key = await kmsDAL.findOne({
      id,
      projectId
    });

    if (!key) {
      throw new NotFoundError({ message: `Key with ID ${id} not found` });
    }

    if (key.isReserved) {
      throw new BadRequestError({ message: "Cannot revoke reserved keys" });
    }

    const completeKeyDetails = await kmsDAL.findByIdWithAssociatedKms(id);

    if (!completeKeyDetails.internalKms) {
      throw new BadRequestError({
        message: "Cannot revoke external keys"
      });
    }

    const revokedKey = await kmsDAL.updateById(key.id, {
      isDisabled: true
    });

    recordKmipOperationMetric({
      operationType: KmipOperationType.REVOKE,
      orgId: actorOrgId,
      projectId,
      clientId,
      objectId: id,
      objectName: key.name
    });

    return {
      id: key.id,
      updatedAt: revokedKey.updatedAt
    };
  };

  const getAttributes = async ({
    projectId,
    id,
    clientId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TKmipGetAttributesDTO) => {
    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor,
      actorId,
      orgId: actorOrgId,
      actorAuthMethod,
      actorOrgId
    });

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionKmipActions.Proxy, OrgPermissionSubjects.Kmip);

    const kmipClient = await kmipClientDAL.findOne({
      id: clientId,
      projectId
    });

    if (!kmipClient.permissions?.includes(KmipPermission.GetAttributes)) {
      throw new ForbiddenRequestError({
        message: "Client does not have sufficient permission to perform KMIP get attributes"
      });
    }

    const key = await kmsDAL.findOne({
      id,
      projectId
    });

    if (!key) {
      throw new NotFoundError({ message: `Key with ID ${id} not found` });
    }

    if (key.isReserved) {
      throw new BadRequestError({ message: "Cannot get reserved keys" });
    }

    const completeKeyDetails = await kmsDAL.findByIdWithAssociatedKms(id);

    if (!completeKeyDetails.internalKms) {
      throw new BadRequestError({
        message: "Cannot get external keys"
      });
    }

    recordKmipOperationMetric({
      operationType: KmipOperationType.GET_ATTRIBUTES,
      orgId: actorOrgId,
      projectId,
      clientId,
      objectId: id,
      objectName: key.name
    });

    return {
      id: key.id,
      algorithm: completeKeyDetails.internalKms.encryptionAlgorithm,
      isActive: !key.isDisabled,
      createdAt: key.createdAt,
      updatedAt: key.updatedAt,
      kmipMetadata: key.kmipMetadata as Record<string, unknown>
    };
  };

  const locate = async ({ projectId, clientId, actor, actorId, actorAuthMethod, actorOrgId }: TKmipLocateDTO) => {
    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor,
      actorId,
      orgId: actorOrgId,
      actorAuthMethod,
      actorOrgId
    });

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionKmipActions.Proxy, OrgPermissionSubjects.Kmip);

    const kmipClient = await kmipClientDAL.findOne({
      id: clientId,
      projectId
    });

    if (!kmipClient.permissions?.includes(KmipPermission.Locate)) {
      throw new ForbiddenRequestError({
        message: "Client does not have sufficient permission to perform KMIP locate"
      });
    }

    const keys = await kmsDAL.findProjectCmeks(projectId);

    recordKmipOperationMetric({
      operationType: KmipOperationType.LOCATE,
      orgId: actorOrgId,
      projectId,
      clientId
    });

    return keys;
  };

  const register = async ({
    projectId,
    clientId,
    key,
    algorithm,
    name,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    kmipMetadata
  }: TKmipRegisterDTO) => {
    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor,
      actorId,
      orgId: actorOrgId,
      actorAuthMethod,
      actorOrgId
    });

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionKmipActions.Proxy, OrgPermissionSubjects.Kmip);

    const kmipClient = await kmipClientDAL.findOne({
      id: clientId,
      projectId
    });

    if (!kmipClient.permissions?.includes(KmipPermission.Register)) {
      throw new ForbiddenRequestError({
        message: "Client does not have sufficient permission to perform KMIP register"
      });
    }

    const project = await projectDAL.findById(projectId);

    const kmsKey = await kmsService.importKeyMaterial({
      name,
      key: Buffer.from(key, "base64"),
      algorithm,
      isReserved: false,
      projectId,
      keyUsage: KmsKeyUsage.ENCRYPT_DECRYPT,
      orgId: project.orgId,
      kmipMetadata
    });

    recordKmipOperationMetric({
      operationType: KmipOperationType.REGISTER,
      orgId: actorOrgId,
      projectId,
      clientId,
      objectId: kmsKey.id,
      objectName: kmsKey.name
    });

    return kmsKey;
  };

  return {
    create,
    get,
    activate,
    getAttributes,
    destroy,
    revoke,
    locate,
    register
  };
};
