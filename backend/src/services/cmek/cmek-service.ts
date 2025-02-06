import { ForbiddenError } from "@casl/ability";

import { ActionProjectType, ProjectType } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { ProjectPermissionCmekActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { DatabaseErrorCode } from "@app/lib/error-codes";
import { BadRequestError, DatabaseError, NotFoundError } from "@app/lib/errors";
import { OrgServiceActor } from "@app/lib/types";
import {
  TCmekDecryptDTO,
  TCmekEncryptDTO,
  TCreateCmekDTO,
  TListCmeksByProjectIdDTO,
  TUpdabteCmekByIdDTO
} from "@app/services/cmek/cmek-types";
import { TKmsKeyDALFactory } from "@app/services/kms/kms-key-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

import { TProjectDALFactory } from "../project/project-dal";

type TCmekServiceFactoryDep = {
  kmsService: TKmsServiceFactory;
  kmsDAL: TKmsKeyDALFactory;
  permissionService: TPermissionServiceFactory;
  projectDAL: Pick<TProjectDALFactory, "getProjectFromSplitId">;
};

export type TCmekServiceFactory = ReturnType<typeof cmekServiceFactory>;

export const cmekServiceFactory = ({ kmsService, kmsDAL, permissionService, projectDAL }: TCmekServiceFactoryDep) => {
  const createCmek = async ({ projectId: preSplitProjectId, ...dto }: TCreateCmekDTO, actor: OrgServiceActor) => {
    let projectId = preSplitProjectId;
    const cmekProjectFromSplit = await projectDAL.getProjectFromSplitId(projectId, ProjectType.KMS);
    if (cmekProjectFromSplit) {
      projectId = cmekProjectFromSplit.id;
    }

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.KMS
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionCmekActions.Create, ProjectPermissionSub.Cmek);

    try {
      const cmek = await kmsService.generateKmsKey({
        ...dto,
        projectId,
        isReserved: false
      });

      return {
        ...cmek,
        version: 1,
        encryptionAlgorithm: dto.encryptionAlgorithm
      };
    } catch (err) {
      if (err instanceof DatabaseError && (err.error as { code: string })?.code === DatabaseErrorCode.UniqueViolation) {
        throw new BadRequestError({
          message: `A KMS key with the name "${dto.name}" already exists for the project with ID "${projectId}"`
        });
      }

      throw err;
    }
  };

  const updateCmekById = async ({ keyId, ...data }: TUpdabteCmekByIdDTO, actor: OrgServiceActor) => {
    const key = await kmsDAL.findCmekById(keyId);

    if (!key) throw new NotFoundError({ message: `Key with ID ${keyId} not found` });

    if (!key.projectId || key.isReserved) throw new BadRequestError({ message: "Key is not customer managed" });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId: key.projectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.KMS
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionCmekActions.Edit, ProjectPermissionSub.Cmek);

    try {
      const cmek = await kmsDAL.updateById(keyId, data);

      return {
        ...cmek,
        version: key.version,
        encryptionAlgorithm: key.encryptionAlgorithm
      };
    } catch (err) {
      if (err instanceof DatabaseError && (err.error as { code: string })?.code === DatabaseErrorCode.UniqueViolation) {
        throw new BadRequestError({
          message: `A KMS key with the name "${data.name!}" already exists for the project with ID "${key.projectId}"`
        });
      }

      throw err;
    }
  };

  const deleteCmekById = async (keyId: string, actor: OrgServiceActor) => {
    const key = await kmsDAL.findCmekById(keyId);

    if (!key) throw new NotFoundError({ message: `Key with ID ${keyId} not found` });

    if (!key.projectId || key.isReserved) throw new BadRequestError({ message: "Key is not customer managed" });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId: key.projectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.KMS
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionCmekActions.Delete, ProjectPermissionSub.Cmek);

    await kmsDAL.deleteById(keyId);

    return key;
  };

  const listCmeksByProjectId = async (
    { projectId: preSplitProjectId, ...filters }: TListCmeksByProjectIdDTO,
    actor: OrgServiceActor
  ) => {
    let projectId = preSplitProjectId;
    const cmekProjectFromSplit = await projectDAL.getProjectFromSplitId(preSplitProjectId, ProjectType.KMS);
    if (cmekProjectFromSplit) {
      projectId = cmekProjectFromSplit.id;
    }

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.KMS
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionCmekActions.Read, ProjectPermissionSub.Cmek);

    const { keys: cmeks, totalCount } = await kmsDAL.listCmeksByProjectId({ projectId, ...filters });

    return { cmeks, totalCount };
  };

  const findCmekById = async (keyId: string, actor: OrgServiceActor) => {
    const key = await kmsDAL.findCmekById(keyId);

    if (!key) throw new NotFoundError({ message: `Key with ID "${keyId}" not found` });

    if (!key.projectId || key.isReserved) throw new BadRequestError({ message: "Key is not customer managed" });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId: key.projectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.KMS
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionCmekActions.Read, ProjectPermissionSub.Cmek);

    return key;
  };

  const findCmekByName = async (keyName: string, projectId: string, actor: OrgServiceActor) => {
    const key = await kmsDAL.findCmekByName(keyName, projectId);

    if (!key)
      throw new NotFoundError({ message: `Key with name "${keyName}" not found for project with ID "${projectId}"` });

    if (!key.projectId || key.isReserved) throw new BadRequestError({ message: "Key is not customer managed" });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId: key.projectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.KMS
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionCmekActions.Read, ProjectPermissionSub.Cmek);

    return key;
  };

  const cmekEncrypt = async ({ keyId, plaintext }: TCmekEncryptDTO, actor: OrgServiceActor) => {
    const key = await kmsDAL.findById(keyId);

    if (!key) throw new NotFoundError({ message: `Key with ID "${keyId}" not found` });

    if (!key.projectId || key.isReserved) throw new BadRequestError({ message: "Key is not customer managed" });

    if (key.isDisabled) throw new BadRequestError({ message: "Key is disabled" });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId: key.projectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.KMS
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionCmekActions.Encrypt, ProjectPermissionSub.Cmek);

    const encrypt = await kmsService.encryptWithKmsKey({ kmsId: keyId });

    const { cipherTextBlob } = await encrypt({ plainText: Buffer.from(plaintext, "base64") });

    return cipherTextBlob.toString("base64");
  };

  const cmekDecrypt = async ({ keyId, ciphertext }: TCmekDecryptDTO, actor: OrgServiceActor) => {
    const key = await kmsDAL.findById(keyId);

    if (!key) throw new NotFoundError({ message: `Key with ID "${keyId}" not found` });

    if (!key.projectId || key.isReserved) throw new BadRequestError({ message: "Key is not customer managed" });

    if (key.isDisabled) throw new BadRequestError({ message: "Key is disabled" });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId: key.projectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.KMS
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionCmekActions.Decrypt, ProjectPermissionSub.Cmek);

    const decrypt = await kmsService.decryptWithKmsKey({ kmsId: keyId });

    const plaintextBlob = await decrypt({ cipherTextBlob: Buffer.from(ciphertext, "base64") });

    return plaintextBlob.toString("base64");
  };

  return {
    createCmek,
    updateCmekById,
    deleteCmekById,
    listCmeksByProjectId,
    cmekEncrypt,
    cmekDecrypt,
    findCmekById,
    findCmekByName
  };
};
