import { ProjectType } from "@app/db/schemas";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { TKmsKeyDALFactory } from "@app/services/kms/kms-key-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import { TKmipClientDALFactory } from "./kmip-client-dal";
import { KmipPermission } from "./kmip-enum";
import {
  TKmipCreateDTO,
  TKmipDeleteDTO,
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
  projectDAL: Pick<TProjectDALFactory, "getProjectFromSplitId" | "findById">;
};

export type TKmipOperationServiceFactory = ReturnType<typeof kmipOperationServiceFactory>;

export const kmipOperationServiceFactory = ({
  kmsService,
  kmsDAL,
  projectDAL,
  kmipClientDAL
}: TKmipOperationServiceFactoryDep) => {
  const create = async ({ projectId: preSplitProjectId, clientId, algorithm }: TKmipCreateDTO) => {
    let projectId = preSplitProjectId;
    const cmekProjectFromSplit = await projectDAL.getProjectFromSplitId(projectId, ProjectType.KMS);
    if (cmekProjectFromSplit) {
      projectId = cmekProjectFromSplit.id;
    }

    const project = await projectDAL.findById(projectId);
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
      orgId: project.orgId,
      projectId,
      isReserved: false
    });

    return kmsKey;
  };

  const deleteOp = async ({ projectId: preSplitProjectId, id, clientId }: TKmipDeleteDTO) => {
    let projectId = preSplitProjectId;
    const cmekProjectFromSplit = await projectDAL.getProjectFromSplitId(projectId, ProjectType.KMS);

    if (cmekProjectFromSplit) {
      projectId = cmekProjectFromSplit.id;
    }

    const kmipClient = await kmipClientDAL.findOne({
      id: clientId,
      projectId
    });

    if (!kmipClient.permissions?.includes(KmipPermission.Delete)) {
      throw new ForbiddenRequestError({
        message: "Client does not have sufficient permission to perform KMIP delete"
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
      throw new BadRequestError({ message: "Cannot delete reserved keys" });
    }

    const completeKeyDetails = await kmsDAL.findByIdWithAssociatedKms(id);
    if (!completeKeyDetails.internalKms) {
      throw new BadRequestError({
        message: "Cannot delete external keys"
      });
    }

    const kms = kmsDAL.deleteById(id);

    return kms;
  };

  const get = async ({ projectId: preSplitProjectId, id, clientId }: TKmipGetDTO) => {
    let projectId = preSplitProjectId;
    const cmekProjectFromSplit = await projectDAL.getProjectFromSplitId(projectId, ProjectType.KMS);

    if (cmekProjectFromSplit) {
      projectId = cmekProjectFromSplit.id;
    }

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

    return {
      id: key.id,
      value: kmsKey.toString("base64"),
      algorithm: completeKeyDetails.internalKms.encryptionAlgorithm,
      isActive: !key.isDisabled,
      createdAt: key.createdAt,
      updatedAt: key.updatedAt
    };
  };

  const activate = async ({ projectId: preSplitProjectId, id, clientId }: TKmipGetDTO) => {
    let projectId = preSplitProjectId;
    const cmekProjectFromSplit = await projectDAL.getProjectFromSplitId(projectId, ProjectType.KMS);

    if (cmekProjectFromSplit) {
      projectId = cmekProjectFromSplit.id;
    }

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

    return {
      id: key.id,
      isActive: !key.isDisabled
    };
  };

  const revoke = async ({ projectId: preSplitProjectId, id, clientId }: TKmipRevokeDTO) => {
    let projectId = preSplitProjectId;
    const cmekProjectFromSplit = await projectDAL.getProjectFromSplitId(projectId, ProjectType.KMS);

    if (cmekProjectFromSplit) {
      projectId = cmekProjectFromSplit.id;
    }

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

    return {
      id: key.id,
      updatedAt: revokedKey.updatedAt
    };
  };

  const getAttributes = async ({ projectId: preSplitProjectId, id, clientId }: TKmipGetAttributesDTO) => {
    let projectId = preSplitProjectId;
    const cmekProjectFromSplit = await projectDAL.getProjectFromSplitId(projectId, ProjectType.KMS);

    if (cmekProjectFromSplit) {
      projectId = cmekProjectFromSplit.id;
    }

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

    return {
      id: key.id,
      algorithm: completeKeyDetails.internalKms.encryptionAlgorithm,
      isActive: !key.isDisabled,
      createdAt: key.createdAt,
      updatedAt: key.updatedAt
    };
  };

  const locate = async ({ projectId: preSplitProjectId, clientId }: TKmipLocateDTO) => {
    let projectId = preSplitProjectId;
    const cmekProjectFromSplit = await projectDAL.getProjectFromSplitId(projectId, ProjectType.KMS);

    if (cmekProjectFromSplit) {
      projectId = cmekProjectFromSplit.id;
    }

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

    return keys;
  };

  const register = async ({ projectId: preSplitProjectId, clientId, key, algorithm, name }: TKmipRegisterDTO) => {
    let projectId = preSplitProjectId;
    const cmekProjectFromSplit = await projectDAL.getProjectFromSplitId(projectId, ProjectType.KMS);

    if (cmekProjectFromSplit) {
      projectId = cmekProjectFromSplit.id;
    }

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
      orgId: project.orgId
    });

    return kmsKey;
  };

  return {
    create,
    get,
    activate,
    getAttributes,
    deleteOp,
    revoke,
    locate,
    register
  };
};
